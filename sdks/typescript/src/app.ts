import type { DeliveryReceipt } from "@acp/adapter";
import { AcpError, ConflictError, createActionId, ValidationError } from "@acp/core";
import {
  ActionExecutedSchema,
  ActionFailedSchema,
  type ActionRequest,
  ActionRequestSchema,
  ApprovalOutcome,
  createEvent,
  type EventEnvelope,
} from "@acp/protocol";
import { AcpRuntime, ChannelGateway, SYSTEM_ACTOR } from "@acp/runtime";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";

import { AgentHost } from "./agent-host.js";
import type {
  AcpApp,
  AcpAppOptions,
  AcpHooks,
  ActionDefinition,
  ActionExecutionContext,
  ActionRequestOptions,
  ActionResult,
  AgentCard,
  AgentDefinition,
  ChannelDefinition,
} from "./types.js";

interface PendingAction {
  action: ActionRequest;
  actor: ActionExecutionContext["actor"];
  definition: ActionDefinition<unknown, unknown>;
  event: EventEnvelope;
  input: unknown;
  options: ActionRequestOptions;
}

/** Creates a lifecycle-managed ACP application for agents, channels, and actions. */
export function createAcp(options: AcpAppOptions): AcpApp {
  return new AcpApplication(options);
}

class AcpApplication implements AcpApp {
  readonly gateway: ChannelGateway;
  readonly runtime: AcpRuntime;
  private readonly actions = new Map<string, ActionDefinition<unknown, unknown>>();
  private readonly defaultApprover: NonNullable<AcpAppOptions["defaultApprover"]>;
  private readonly hooks: AcpHooks;
  private readonly pendingActions = new Map<string, PendingAction>();
  private readonly host: AgentHost;
  private state: "created" | "running" | "stopping" | "stopped" = "created";
  private sourceAbort?: AbortController;
  private runtimeSubscription?: () => void;
  private readonly active = new Set<Promise<unknown>>();

  constructor(options: AcpAppOptions) {
    this.hooks = options.hooks ?? {};
    this.defaultApprover = options.defaultApprover ?? SYSTEM_ACTOR;
    this.runtime = new AcpRuntime({
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
      onDelivery: (receipt) => this.runHook(this.hooks.onDelivery, receipt),
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
    if (this.actions.has(action.type)) {
      throw new ConflictError("ACP action", action.type);
    }
    this.actions.set(action.type, action as ActionDefinition<unknown, unknown>);
  }

  on(eventType: string, handler: (event: EventEnvelope) => void | Promise<void>): () => void {
    return this.runtime.subscribe(async (event) => {
      if (event.eventType === eventType) {
        await handler(event);
      }
    });
  }

  async start(): Promise<void> {
    if (this.state === "running") {
      return;
    }
    if (this.state === "stopping" || this.state === "stopped") {
      throw new AcpError("ACP_TRANSPORT", `Cannot start ACP app while it is ${this.state}`);
    }
    this.sourceAbort = new AbortController();
    this.host.attach();
    await this.gateway.start(
      (event) => this.ingest(event).then(() => undefined),
      this.sourceAbort.signal,
    );
    this.state = "running";
  }

  async stop(options: { timeoutMs?: number } = {}): Promise<void> {
    if (this.state === "stopped") {
      return;
    }
    this.state = "stopping";
    this.sourceAbort?.abort();
    await this.gateway.stop();
    this.host.detach();
    await this.drain(options.timeoutMs ?? 30_000);
    this.runtimeSubscription?.();
    this.runtimeSubscription = undefined;
    this.state = "stopped";
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
    const definition = this.actions.get(type);
    if (!definition) {
      throw new ValidationError(`No ACP action is registered for type: ${type}`);
    }
    let validated: unknown = input;
    try {
      validated = definition.validate ? definition.validate(input) : input;
    } catch (error) {
      return {
        actionId: options.actionId ?? createActionId(),
        error,
        status: "failed",
      };
    }
    const actionId = options.actionId ?? createActionId();
    const action = create(ActionRequestSchema, {
      actionId,
      parameters: { input: this.serializeInput(validated) },
      target: options.target ?? `action:${type}`,
      type,
    });
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
    const submission = await this.runtime.submitAction({
      action,
      actor,
      approver: actionOptions.approver,
      channel: actionOptions.channel,
      conversation: actionOptions.conversation,
      deadline: actionOptions.deadline,
      reason: actionOptions.reason,
      recipient: actionOptions.recipient,
    });
    if (submission.status === "blocked") {
      return { actionId, reason: submission.decision.reason, status: "blocked" };
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
      this.pendingActions.set(submission.approvalId, pending);
      return { actionId, approvalId: submission.approvalId, status: "approval_required" };
    }
    return (await this.executeAction(pending)) as ActionResult<TResult>;
  }

  private async executeAction(pending: PendingAction): Promise<ActionResult<unknown>> {
    await this.runHook(this.hooks.onActionStarted, pending.action.type, pending.action.actionId);
    const context: ActionExecutionContext = {
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
      await this.runHook(this.hooks.onActionCompleted, completed);
      return completed;
    } catch (error) {
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
            errorCode: error instanceof AcpError ? error.code : "ACP_ACTION_FAILED",
            errorMessage: error instanceof Error ? error.message : String(error),
            retryable: Boolean(
              error && typeof error === "object" && "retryable" in error
                ? (error as { retryable?: unknown }).retryable
                : false,
            ),
          }),
        },
        recipient: pending.options.recipient,
        source: SYSTEM_ACTOR,
      });
      await this.runtime.process(failedEvent);
      const failed: ActionResult<unknown> = {
        actionId: pending.action.actionId,
        error,
        status: "failed",
      };
      await this.runHook(this.hooks.onActionCompleted, failed);
      return failed;
    }
  }

  private async handleRuntimeEvent(event: EventEnvelope): Promise<void> {
    await this.runHook(this.hooks.onEventAccepted, event);
    if (event.eventType === "approval.granted" && event.payload.case === "approvalDecided") {
      const pending = this.pendingActions.get(event.payload.value.approvalId);
      if (pending) {
        this.pendingActions.delete(event.payload.value.approvalId);
        await this.executeAction(pending);
      }
    }
    if (
      (event.eventType === "approval.denied" || event.eventType === "approval.expired") &&
      (event.payload.case === "approvalDecided" || event.payload.case === "approvalExpired")
    ) {
      this.pendingActions.delete(event.payload.value.approvalId);
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
      await this.hooks.onError?.(error);
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
            () => reject(new AcpError("ACP_TRANSPORT", "ACP app shutdown timed out")),
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
      throw new AcpError("ACP_TRANSPORT", `ACP app is ${this.state}`);
    }
  }

  private serializeInput(input: unknown): string {
    if (input === undefined || typeof input === "function" || typeof input === "symbol") {
      throw new ValidationError("ACP action input must be JSON serializable");
    }
    try {
      return JSON.stringify(input);
    } catch (error) {
      throw new ValidationError("ACP action input must be JSON serializable", { cause: error });
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
export function isAcpApp(value: unknown): value is AcpApp {
  return Boolean(value && typeof value === "object" && "ingest" in value && "start" in value);
}
