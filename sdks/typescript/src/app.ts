import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { DeliveryReceipt } from "@frontal-labs/open-channel-adapter";
import {
  ActionError,
  ConflictError,
  createActionId,
  OcpError,
  ValidationError,
} from "@frontal-labs/open-channel-core";
import {
  ActionExecutedSchema,
  ActionFailedSchema,
  type ActionRequest,
  ActionRequestSchema,
  ApprovalOutcome,
  createEvent,
  type EventEnvelope,
  type EventName,
} from "@frontal-labs/open-channel-protocol";
import { ChannelGateway, OcpRuntime, SYSTEM_ACTOR } from "@frontal-labs/open-channel-runtime";
import { AgentHost } from "./agent-host.js";
import type {
  ActionDefinition,
  ActionExecutionContext,
  ActionRequestOptions,
  ActionResult,
  AgentCard,
  AgentDefinition,
  ChannelDefinition,
  OcpApp,
  OcpAppOptions,
  OcpHooks,
} from "./types.js";

interface PendingAction {
  action: ActionRequest;
  actor: ActionExecutionContext["actor"];
  definition: ActionDefinition<unknown, unknown>;
  event: EventEnvelope;
  input: unknown;
  options: ActionRequestOptions;
}

type State = "created" | "running" | "stopping" | "stopped";

/** Creates a lifecycle-managed OCP application for agents, channels, and actions. */
export function createOcp(options: OcpAppOptions): OcpApp {
  return new OcpApplication(options);
}

class OcpApplication implements OcpApp {
  readonly gateway: ChannelGateway;
  readonly runtime: OcpRuntime;
  private readonly actions: Partial<Record<string, ActionDefinition<unknown, unknown>>> =
    Object.create(null);
  private readonly defaultApprover: NonNullable<OcpAppOptions["defaultApprover"]>;
  private readonly hooks: OcpHooks;
  private readonly pendingActions: Partial<Record<string, PendingAction>> = Object.create(null);
  private readonly actionResults: Partial<Record<string, ActionResult<unknown>>> =
    Object.create(null);
  private readonly actionRuns: Partial<Record<string, Promise<ActionResult<unknown>>>> =
    Object.create(null);
  private readonly host: AgentHost;
  private state: State = "created";
  private sourceAbort?: AbortController;
  private runtimeSubscription?: () => void;
  private readonly active = new Set<Promise<unknown>>();

  constructor(options: OcpAppOptions) {
    this.hooks = options.hooks ?? {};
    this.defaultApprover = options.defaultApprover ?? SYSTEM_ACTOR;
    this.runtime = new OcpRuntime({
      clock: options.clock,
      defaultApprovalTimeoutMs: options.defaultApprovalTimeoutMs,
      eventStore: options.eventStore,
      policy: options.policy,
      runtimeActor: options.runtimeActor,
    });
    this.gateway = new ChannelGateway(this.runtime);
    for (const channel of options.channels ?? []) {
      this.registerChannel(channel);
    }
    for (const action of options.actions ?? []) {
      this.registerAction(action);
    }
    this.host = new AgentHost({
      actionRequester: (agent, event, type, input, actionOptions) =>
        this.requestAction(agent, event, type, input, actionOptions),
      agents: options.agents,
      gateway: this.gateway,
      maxConcurrentConversations: options.concurrency?.maxConcurrentConversations,
      onDelivery: (receipt) => this.runHook(this.hooks.onDelivery, receipt),
      onError: (error) => this.runHook(this.hooks.onError, error),
      runtime: this.runtime,
    });
    this.runtimeSubscription = this.runtime.subscribe((event) => this.handleRuntimeEvent(event));
  }

  registerAgent(agent: AgentDefinition): void {
    this.host.register(agent);
  }

  listAgentCards(): AgentCard[] {
    return this.host.listAgentCards();
  }

  registerAction<TInput, TResult>(action: ActionDefinition<TInput, TResult>): void {
    if (action.type in this.actions) {
      throw new ConflictError("OCP action", action.type);
    }
    this.actions[action.type] = action as ActionDefinition<unknown, unknown>;
  }

  on<T extends EventName>(
    eventType: T,
    handler: (event: EventEnvelope & { eventType: T }) => void | Promise<void>,
  ): () => void {
    return this.runtime.subscribe(async (event) => {
      if (event.eventType === eventType) {
        try {
          await handler(event as EventEnvelope & { eventType: T });
        } catch (error) {
          await this.reportError(error, event.eventId);
        }
      }
    });
  }

  async start(): Promise<void> {
    if (this.state === "running") {
      return;
    }
    if (this.state === "stopping" || this.state === "stopped") {
      throw new OcpError("OCP_TRANSPORT", `Cannot start OCP app while it is ${this.state}`);
    }
    this.sourceAbort = new AbortController();
    this.host.attach();
    await this.gateway.start(
      async (event) => {
        try {
          await this.ingest(event);
        } catch (error) {
          await this.reportError(error, event.eventId);
        }
      },
      this.sourceAbort.signal,
      (error) => this.reportError(error),
    );
    this.state = "running";
  }

  async stop(options: { timeoutMs?: number } = {}): Promise<void> {
    if (this.state === "stopped") {
      return;
    }
    this.state = "stopping";
    const timeoutMs = Math.max(0, options.timeoutMs ?? 30_000);
    const startedAt = Date.now();
    this.sourceAbort?.abort();
    try {
      await this.withTimeout(this.gateway.stop(), timeoutMs, "source shutdown");
      // The host stays subscribed while draining so in-flight conversations can still reply.
      await this.drain(this.remainingTimeout(startedAt, timeoutMs));
      await this.withTimeout(
        this.gateway.close(),
        this.remainingTimeout(startedAt, timeoutMs),
        "channel shutdown",
      );
      await this.withTimeout(
        this.runtime.close(),
        this.remainingTimeout(startedAt, timeoutMs),
        "store shutdown",
      );
    } finally {
      this.host.detach();
      this.runtimeSubscription?.();
      this.runtimeSubscription = undefined;
      this.state = "stopped";
    }
  }

  ingest(event: EventEnvelope) {
    this.assertAccepting();
    return this.track(this.gateway.ingest(event));
  }

  receive(provider: string, input: unknown, metadata?: Parameters<ChannelGateway["receive"]>[2]) {
    this.assertAccepting();
    return this.track(this.gateway.receive(provider, input, metadata));
  }

  approve(approvalId: string, approver: ActionExecutionContext["actor"], reason?: string) {
    return this.runtime.decideApproval({
      approvalId,
      approver,
      outcome: ApprovalOutcome.GRANTED,
      reason,
    });
  }

  deny(approvalId: string, approver: ActionExecutionContext["actor"], reason?: string) {
    return this.runtime.decideApproval({
      approvalId,
      approver,
      outcome: ApprovalOutcome.DENIED,
      reason,
    });
  }

  registerChannel(channel: ChannelDefinition): void {
    if (channel.sink) {
      this.gateway.register(channel.sink);
    }
    if (channel.source) {
      this.gateway.registerSource(channel.source);
    }
  }

  private async requestAction<TInput, TResult>(
    actor: ActionExecutionContext["actor"],
    inbound: EventEnvelope,
    type: string,
    input: TInput,
    options: ActionRequestOptions = {},
  ): Promise<ActionResult<TResult>> {
    const definition = this.actions[type];
    if (!definition) {
      throw new ValidationError(`No OCP action is registered for type: ${type}`);
    }
    const actionId = options.actionId ?? createActionId();
    const previous = this.actionResults[actionId];
    if (previous) {
      return previous as ActionResult<TResult>;
    }
    const running = this.actionRuns[actionId];
    if (running) {
      return (await running) as ActionResult<TResult>;
    }
    const stored = await this.runtime.getAction(actionId);
    if (stored?.status === "completed") {
      const completed: ActionResult<unknown> = {
        actionId,
        result: stored.result,
        status: "executed",
      };
      this.actionResults[actionId] = completed;
      return completed as ActionResult<TResult>;
    }
    if (stored?.status === "failed") {
      const failed: ActionResult<unknown> = {
        actionId,
        error: this.toActionError(stored.error, actionId),
        status: "failed",
      };
      this.actionResults[actionId] = failed;
      return failed as ActionResult<TResult>;
    }
    let validated: unknown;
    try {
      validated = definition.validate(input);
    } catch (error) {
      const failed: ActionResult<unknown> = {
        actionId,
        error: this.toActionError(error, actionId),
        status: "failed",
      };
      this.actionResults[actionId] = failed;
      return failed as ActionResult<TResult>;
    }
    const action = create(ActionRequestSchema, {
      actionId,
      parameters: { input: this.serializeInput(validated) },
      target: options.target ?? `action:${type}`,
      type,
    });
    if (!(await this.runtime.claimAction(actionId, "@frontal-labs/open-channel"))) {
      const duplicate: ActionResult<unknown> = {
        actionId,
        error: new ActionError(`OCP action ${actionId} has already been claimed`, {
          actionId,
        }),
        status: "failed",
      };
      this.actionResults[actionId] = duplicate;
      return duplicate as ActionResult<TResult>;
    }
    const actionOptions: ActionRequestOptions & {
      approver: NonNullable<ActionRequestOptions["approver"]>;
      reason: string;
    } = {
      ...options,
      approver: options.approver ?? this.defaultApprover,
      channel: options.channel ?? inbound.channel,
      conversation: options.conversation ?? inbound.conversation,
      reason: options.reason ?? `Requested by ${actor.id}`,
    };
    let submission: Awaited<ReturnType<OcpRuntime["submitAction"]>>;
    try {
      submission = await this.runtime.submitAction({
        action,
        actor,
        approver: actionOptions.approver,
        channel: actionOptions.channel,
        conversation: actionOptions.conversation,
        deadline: actionOptions.deadline,
        reason: actionOptions.reason,
        recipient: actionOptions.recipient,
      });
    } catch (error) {
      const actionError = this.toActionError(error, actionId);
      await this.runtime.failAction(actionId, actionError);
      const failed: ActionResult<unknown> = { actionId, error: actionError, status: "failed" };
      this.actionResults[actionId] = failed;
      await this.runHook(this.hooks.onActionCompleted, failed);
      return failed as ActionResult<TResult>;
    }
    if (submission.status === "blocked") {
      const blocked: ActionResult<unknown> = {
        actionId,
        reason: submission.decision.reason,
        status: "blocked",
      };
      this.actionResults[actionId] = blocked;
      return blocked as ActionResult<TResult>;
    }
    const pending: PendingAction = {
      action,
      actor,
      definition,
      event: inbound,
      input: validated,
      options: actionOptions,
    };
    if (submission.status === "approval_required" && submission.approvalId) {
      this.pendingActions[submission.approvalId] = pending;
      const approval: ActionResult<unknown> = {
        actionId,
        approvalId: submission.approvalId,
        status: "approval_required",
      };
      this.actionResults[actionId] = approval;
      return approval as ActionResult<TResult>;
    }
    const run = this.executeAction(pending);
    this.actionRuns[actionId] = run;
    try {
      return (await run) as ActionResult<TResult>;
    } finally {
      delete this.actionRuns[actionId];
    }
  }

  private async executeAction(pending: PendingAction): Promise<ActionResult<unknown>> {
    await this.runHook(this.hooks.onActionStarted, pending.action);
    const context: ActionExecutionContext = {
      actions: {
        request: <TInput, TResult = unknown>(
          type: string,
          input: TInput,
          options?: ActionRequestOptions,
        ): Promise<ActionResult<TResult>> =>
          this.requestAction(pending.actor, pending.event, type, input, options),
      },
      actor: pending.actor,
      event: pending.event,
      runtime: this.runtime,
    };
    try {
      const result = await pending.definition.execute(pending.input, context);
      const event = createEvent({
        actor: pending.actor,
        causationId: pending.event.eventId,
        channel: pending.options.channel,
        conversation: pending.options.conversation,
        correlationId: pending.event.correlationId || pending.action.actionId,
        eventType: "action.executed",
        occurredAt: timestampFromDate(this.runtime.clock.now()),
        payload: {
          case: "actionExecuted",
          value: create(ActionExecutedSchema, {
            action: pending.action,
            result: this.serializeResult(result),
          }),
        },
        recipient: pending.options.recipient,
        source: SYSTEM_ACTOR,
      });
      await this.runtime.process(event);
      const completed: ActionResult<unknown> = {
        actionId: pending.action.actionId,
        result,
        status: "executed",
      };
      await this.runtime.completeAction(pending.action.actionId, result);
      this.actionResults[pending.action.actionId] = completed;
      await this.runHook(this.hooks.onActionCompleted, completed);
      return completed;
    } catch (error) {
      const actionError = this.toActionError(error, pending.action.actionId);
      const failedEvent = createEvent({
        actor: pending.actor,
        causationId: pending.event.eventId,
        channel: pending.options.channel,
        conversation: pending.options.conversation,
        correlationId: pending.event.correlationId || pending.action.actionId,
        eventType: "action.failed",
        occurredAt: timestampFromDate(this.runtime.clock.now()),
        payload: {
          case: "actionFailed",
          value: create(ActionFailedSchema, {
            action: pending.action,
            errorCode: actionError.code,
            errorMessage: actionError.message,
            retryable: actionError.retryable,
          }),
        },
        recipient: pending.options.recipient,
        source: SYSTEM_ACTOR,
      });
      await this.runtime.process(failedEvent);
      const failed: ActionResult<unknown> = {
        actionId: pending.action.actionId,
        error: actionError,
        status: "failed",
      };
      await this.runtime.failAction(pending.action.actionId, actionError);
      this.actionResults[pending.action.actionId] = failed;
      await this.runHook(this.hooks.onActionCompleted, failed);
      return failed;
    }
  }

  private async handleRuntimeEvent(event: EventEnvelope): Promise<void> {
    await this.runHook(this.hooks.onEventAccepted, event);
    if (event.eventType === "approval.granted" && event.payload.case === "approvalDecided") {
      const pending = this.pendingActions[event.payload.value.approvalId];
      if (pending) {
        delete this.pendingActions[event.payload.value.approvalId];
        const run = this.executeAction(pending);
        this.actionRuns[pending.action.actionId] = run;
        try {
          await run;
        } finally {
          delete this.actionRuns[pending.action.actionId];
        }
      }
    }
    if (
      (event.eventType === "approval.denied" || event.eventType === "approval.expired") &&
      (event.payload.case === "approvalDecided" || event.payload.case === "approvalExpired")
    ) {
      const pending = this.pendingActions[event.payload.value.approvalId];
      if (pending) {
        const blocked: ActionResult<unknown> = {
          actionId: pending.action.actionId,
          reason: event.eventType === "approval.expired" ? "Approval expired" : "Approval denied",
          status: "blocked",
        };
        this.actionResults[pending.action.actionId] = blocked;
        await this.runtime.failAction(
          pending.action.actionId,
          new ActionError(blocked.reason, {
            actionId: pending.action.actionId,
            approvalId: event.payload.value.approvalId,
          }),
        );
        await this.runHook(this.hooks.onActionCompleted, blocked);
      }
      delete this.pendingActions[event.payload.value.approvalId];
    }
    await this.runHook(this.hooks.onEventProcessed, event);
  }

  private async runHook<TArgs extends unknown[]>(
    hook: ((...args: TArgs) => void | Promise<void>) | undefined,
    ...args: TArgs
  ): Promise<void> {
    if (!hook) {
      return;
    }
    try {
      await hook(...args);
    } catch (error) {
      await this.hooks.onError?.(this.toOcpError(error));
    }
  }

  private async reportError(error: unknown, eventId?: string): Promise<void> {
    await this.runHook(this.hooks.onError, this.toOcpError(error, eventId));
  }

  private remainingTimeout(startedAt: number, timeoutMs: number): number {
    return Math.max(0, timeoutMs - (Date.now() - startedAt));
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string,
  ): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new OcpError("OCP_TRANSPORT", `OCP ${operation} timed out`, {
                  retryable: true,
                  stage: "shutdown",
                }),
              ),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private async drain(timeoutMs: number): Promise<void> {
    const drain = async (): Promise<void> => {
      if (this.active.size === 0) {
        return;
      }
      await Promise.allSettled(this.active);
      await this.host.waitForIdle();
      await drain();
    };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        drain(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new OcpError("OCP_TRANSPORT", "OCP app shutdown timed out")),
            Math.max(0, timeoutMs),
          );
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private track<T>(promise: Promise<T>): Promise<T> {
    this.active.add(promise);
    return promise.finally(() => this.active.delete(promise));
  }

  private assertAccepting(): void {
    if (this.state === "stopping" || this.state === "stopped") {
      throw new OcpError("OCP_TRANSPORT", `OCP app is ${this.state}`);
    }
  }

  private toActionError(error: unknown, actionId?: string): ActionError {
    if (error instanceof ActionError) {
      return error;
    }
    return new ActionError(error instanceof Error ? error.message : String(error), {
      actionId,
      cause: error,
      retryable: false,
    });
  }

  private toOcpError(error: unknown, eventId?: string): OcpError {
    return error instanceof OcpError
      ? error
      : new OcpError("OCP_ACTION", error instanceof Error ? error.message : String(error), {
          cause: error,
          eventId,
          stage: "processing",
        });
  }

  private serializeInput(input: unknown): string {
    if (input === undefined || typeof input === "function" || typeof input === "symbol") {
      throw new ValidationError("OCP action input must be JSON serializable");
    }
    try {
      return JSON.stringify(input);
    } catch (error) {
      throw new ValidationError("OCP action input must be JSON serializable", { cause: error });
    }
  }

  private serializeResult(result: unknown): string {
    if (result === undefined) {
      return "null";
    }
    try {
      return typeof result === "string" ? result : JSON.stringify(result);
    } catch {
      return String(result);
    }
  }
}

/** A small helper for adapters that need to report a successful delivery. */
export function deliveryReceipt(
  provider: string,
  event: EventEnvelope,
  externalId?: string,
): DeliveryReceipt {
  return { deliveredAt: new Date(), eventId: event.eventId, externalId, provider };
}

/** Type guard useful when an app is configured with a default empty policy. */
export function isOcpApp(value: unknown): value is OcpApp {
  return Boolean(value && typeof value === "object" && "ingest" in value && "start" in value);
}
