import { ConflictError, NotFoundError } from "@acp/core";
import type { PolicyContext } from "@acp/policy";
import {
  ActionRequestSchema,
  type ActorRef,
  ApprovalDecidedSchema,
  ApprovalExpiredSchema,
  ApprovalOutcome,
  ApprovalRequestedSchema,
  createEvent,
  EscalationTriggeredSchema,
  type EventEnvelope,
  type EventName,
  PolicyEvaluatedSchema,
} from "@acp/protocol";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";

import { SYSTEM_ACTOR } from "./actors.js";
import { SystemClock } from "./clock.js";
import { InMemoryEventStore } from "./store.js";
import type {
  ActionExecutionRecord,
  Clock,
  DecideApprovalInput,
  EventHandler,
  EventStore,
  PendingApproval,
  RuntimeOptions,
  RuntimeResult,
  SubmitActionInput,
  SubmitActionResult,
} from "./types.js";

/** Processes ACP events and manages policy-controlled approvals. */
export class AcpRuntime {
  readonly eventStore: EventStore;
  readonly clock: Clock;
  private readonly policy: RuntimeOptions["policy"];
  private readonly defaultApprovalTimeoutMs: number;
  private readonly runtimeActor: ActorRef;
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly handlers = new Set<EventHandler>();
  private readonly actionRecords = new Map<string, ActionExecutionRecord>();

  constructor(options: RuntimeOptions) {
    this.policy = options.policy;
    this.eventStore = options.eventStore ?? new InMemoryEventStore();
    this.clock = options.clock ?? new SystemClock();
    this.defaultApprovalTimeoutMs = options.defaultApprovalTimeoutMs ?? 60_000;
    this.runtimeActor = options.runtimeActor ?? SYSTEM_ACTOR;
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Claims an action ID exactly once across this runtime/store. */
  claimAction(actionId: string, owner: string): Promise<boolean> {
    if (this.eventStore.claimAction) {
      return this.eventStore.claimAction(actionId, owner);
    }
    if (this.actionRecords.has(actionId)) {
      return Promise.resolve(false);
    }
    this.actionRecords.set(actionId, {
      actionId,
      owner,
      status: "claimed",
    });
    return Promise.resolve(true);
  }

  async completeAction(actionId: string, result: unknown): Promise<void> {
    if (this.eventStore.completeAction) {
      await this.eventStore.completeAction(actionId, result);
    }
    const current = this.actionRecords.get(actionId);
    this.actionRecords.set(actionId, {
      actionId,
      owner: current?.owner,
      result,
      status: "completed",
    });
  }

  async failAction(actionId: string, error: unknown): Promise<void> {
    if (this.eventStore.failAction) {
      await this.eventStore.failAction(actionId, error);
    }
    const current = this.actionRecords.get(actionId);
    this.actionRecords.set(actionId, {
      actionId,
      error,
      owner: current?.owner,
      status: "failed",
    });
  }

  getAction(actionId: string): Promise<ActionExecutionRecord | undefined> {
    if (this.eventStore.getAction) {
      return this.eventStore.getAction(actionId);
    }
    return Promise.resolve(this.actionRecords.get(actionId));
  }

  async close(): Promise<void> {
    await this.eventStore.close?.();
  }

  async process(event: EventEnvelope): Promise<RuntimeResult> {
    let accepted: boolean;
    if (this.eventStore.appendIfAbsent) {
      accepted = await this.eventStore.appendIfAbsent(event);
    } else if (await this.eventStore.has(event.eventId)) {
      accepted = false;
    } else {
      await this.eventStore.append(event);
      accepted = true;
    }
    if (!accepted) {
      return { duplicate: true, emitted: [] };
    }

    await this.notify(event);
    const emitted: EventEnvelope[] = [];

    if (event.eventType === "approval.requested" && event.payload.case === "approvalRequested") {
      this.trackApproval(event);
    }

    if (
      (event.eventType === "approval.granted" || event.eventType === "approval.denied") &&
      event.payload.case === "approvalDecided"
    ) {
      this.resolveApproval(event.payload.value.approvalId, event.payload.value.outcome);
    }

    if (event.eventType === "approval.expired" && event.payload.case === "approvalExpired") {
      const pending = this.pendingApprovals.get(event.payload.value.approvalId);
      if (pending && pending.status === "pending") {
        pending.status = "expired";
        const escalation = createEvent({
          actor: this.runtimeActor,
          causationId: event.eventId,
          channel: pending.channel,
          conversation: pending.conversation,
          correlationId: event.correlationId || event.eventId,
          eventType: "escalation.triggered",
          occurredAt: timestampFromDate(this.clock.now()),
          payload: {
            case: "escalationTriggered",
            value: create(EscalationTriggeredSchema, {
              escalationId: `${event.payload.value.approvalId}:escalation`,
              reason: "Approval deadline expired",
              relatedApprovalId: event.payload.value.approvalId,
              source: pending.agent,
              target: pending.approver,
            }),
          },
          recipient: pending.approver,
          source: this.runtimeActor,
        });
        await this.record(escalation);
        emitted.push(escalation);
      }
    }

    return { duplicate: false, emitted };
  }

  async submitAction(input: SubmitActionInput): Promise<SubmitActionResult> {
    const context: PolicyContext = {
      actionType: input.action.type,
      actor: input.actor,
      recipient: input.recipient,
      target: input.action.target,
    };
    const decision = this.policy.evaluate(context);
    const policyEventType: EventName = decision.allowed ? "policy.allowed" : "policy.blocked";
    const policyEvent = createEvent({
      actor: input.actor,
      channel: input.channel,
      conversation: input.conversation,
      eventType: policyEventType,
      occurredAt: timestampFromDate(this.clock.now()),
      payload: {
        case: "policyEvaluated",
        value: create(PolicyEvaluatedSchema, {
          actionType: input.action.type,
          allowed: decision.allowed,
          approvalRequired: decision.approvalRequired,
          policyId: decision.policyId,
          reason: decision.reason,
          recipient: input.recipient,
        }),
      },
      recipient: input.recipient,
      source: this.runtimeActor,
    });
    await this.process(policyEvent);
    const events = [policyEvent];

    if (!decision.allowed) {
      return { decision, events, status: "blocked" };
    }

    if (!decision.approvalRequired) {
      return { decision, events, status: "authorized" };
    }

    const approvalId = `${input.action.actionId || input.action.type}:${this.clock.now().getTime()}`;
    const deadline =
      input.deadline ?? new Date(this.clock.now().getTime() + this.defaultApprovalTimeoutMs);
    const approvalEvent = createEvent({
      actor: input.actor,
      causationId: policyEvent.eventId,
      channel: input.channel,
      conversation: input.conversation,
      correlationId: policyEvent.eventId,
      eventType: "approval.requested",
      occurredAt: timestampFromDate(this.clock.now()),
      payload: {
        case: "approvalRequested",
        value: create(ApprovalRequestedSchema, {
          agent: input.actor,
          approvalId,
          approver: input.approver,
          deadline: timestampFromDate(deadline),
          reason: input.reason,
          requestedAction: input.action,
        }),
      },
      recipient: input.approver,
      source: this.runtimeActor,
    });
    await this.process(approvalEvent);
    events.push(approvalEvent);

    return { approvalId, decision, events, status: "approval_required" };
  }

  decideApproval(input: DecideApprovalInput): Promise<RuntimeResult> {
    const pending = this.pendingApprovals.get(input.approvalId);
    if (!pending) {
      throw new NotFoundError("ACP approval", input.approvalId);
    }
    if (pending.status !== "pending") {
      throw new ConflictError("ACP approval", input.approvalId, {
        details: { status: pending.status },
      });
    }

    const eventType: EventName =
      input.outcome === ApprovalOutcome.GRANTED ? "approval.granted" : "approval.denied";
    const event = createEvent({
      actor: input.approver,
      channel: pending.channel,
      conversation: pending.conversation,
      correlationId: input.approvalId,
      eventType,
      occurredAt: timestampFromDate(this.clock.now()),
      payload: {
        case: "approvalDecided",
        value: create(ApprovalDecidedSchema, {
          approvalId: input.approvalId,
          approver: input.approver,
          outcome: input.outcome,
          reason: input.reason ?? "",
        }),
      },
      recipient: pending.agent,
      source: input.approver,
    });
    return this.process(event);
  }

  private trackApproval(event: EventEnvelope): void {
    if (event.payload.case !== "approvalRequested") {
      return;
    }
    const approval = event.payload.value;
    const deadlineMs = approval.deadline
      ? Number(approval.deadline.seconds) * 1000 + approval.deadline.nanos / 1_000_000
      : undefined;
    const delayMs =
      deadlineMs === undefined
        ? this.defaultApprovalTimeoutMs
        : Math.max(0, deadlineMs - this.clock.now().getTime());
    const pending: PendingApproval = {
      action: approval.requestedAction ?? create(ActionRequestSchema),
      agent: approval.agent ?? this.runtimeActor,
      approvalId: approval.approvalId,
      approver: approval.approver ?? this.runtimeActor,
      channel: event.channel,
      conversation: event.conversation,
      status: "pending",
    };
    pending.timer = this.clock.schedule(delayMs, async () => {
      if (pending.status !== "pending") {
        return;
      }
      const expired = createEvent({
        actor: this.runtimeActor,
        causationId: event.eventId,
        channel: pending.channel,
        conversation: pending.conversation,
        correlationId: event.correlationId || event.eventId,
        eventType: "approval.expired",
        occurredAt: timestampFromDate(this.clock.now()),
        payload: {
          case: "approvalExpired",
          value: create(ApprovalExpiredSchema, {
            approvalId: pending.approvalId,
            reason: "Approval deadline expired",
          }),
        },
        recipient: pending.approver,
        source: this.runtimeActor,
      });
      await this.process(expired);
    });
    this.pendingApprovals.set(approval.approvalId, pending);
  }

  private resolveApproval(approvalId: string, outcome: ApprovalOutcome): void {
    const pending = this.pendingApprovals.get(approvalId);
    if (pending?.status !== "pending") {
      return;
    }
    if (outcome === ApprovalOutcome.GRANTED) {
      pending.status = "granted";
    }
    if (outcome === ApprovalOutcome.DENIED) {
      pending.status = "denied";
    }
    if (pending.status !== "pending" && pending.timer !== undefined) {
      this.clock.cancel(pending.timer);
    }
  }

  private async record(event: EventEnvelope): Promise<void> {
    await this.eventStore.append(event);
    await this.notify(event);
  }

  private async notify(event: EventEnvelope): Promise<void> {
    for (const handler of this.handlers) {
      // biome-ignore lint/performance/noAwaitInLoops: Event handlers are ordered subscribers.
      await handler(event);
    }
  }
}
