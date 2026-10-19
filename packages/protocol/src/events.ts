import { randomUUID } from "node:crypto";
import { ValidationError } from "@acp/core";
import { create } from "@bufbuild/protobuf";
import { timestampNow } from "@bufbuild/protobuf/wkt";

import type { EVENT_TYPES } from "./constants.js";
import { ACP_PROTOCOL_VERSION } from "./constants.js";
import { ApprovalOutcome, type EventEnvelope, EventEnvelopeSchema } from "./generated.js";
import { EventInputSchema } from "./schemas.js";

export { ACP_PROTOCOL_VERSION, EVENT_TYPES } from "./constants.js";

/** String event name accepted by the ACP event factory. */
export type EventName = (typeof EVENT_TYPES)[number];
/** Any populated protobuf payload variant in an event envelope. */
export type EventPayload = Exclude<EventEnvelope["payload"], { case: undefined }>;

const PAYLOAD_CASE_BY_EVENT_TYPE: Record<EventName, Exclude<EventPayload["case"], undefined>> = {
  "action.executed": "actionExecuted",
  "action.failed": "actionFailed",
  "approval.denied": "approvalDecided",
  "approval.expired": "approvalExpired",
  "approval.granted": "approvalDecided",
  "approval.requested": "approvalRequested",
  "escalation.triggered": "escalationTriggered",
  "handoff.completed": "handoffCompleted",
  "handoff.initiated": "handoffInitiated",
  "message.received": "messageReceived",
  "message.sent": "messageSent",
  "policy.allowed": "policyEvaluated",
  "policy.blocked": "policyEvaluated",
  "task.assigned": "taskAssigned",
  "task.created": "taskCreated",
};

/** Input used to construct and validate an ACP event envelope. */
export interface EventInput {
  actor?: EventEnvelope["actor"];
  causationId?: string;
  channel?: EventEnvelope["channel"];
  conversation?: EventEnvelope["conversation"];
  correlationId?: string;
  eventId?: string;
  eventType: EventName;
  extensions?: Record<string, string>;
  idempotencyKey?: string;
  occurredAt?: EventEnvelope["occurredAt"];
  payload: EventPayload;
  protocolVersion?: string;
  recipient?: EventEnvelope["recipient"];
  source?: EventEnvelope["source"];
}

/** Creates a validated protobuf event envelope with stable IDs and defaults. */
export function createEvent(input: EventInput): EventEnvelope {
  let validatedInput: EventInput;
  try {
    validatedInput = EventInputSchema.parse(input) as unknown as EventInput;
  } catch (error) {
    throw new ValidationError("Invalid ACP event input", {
      cause: error,
      details: { issues: error instanceof Error ? error.message : String(error) },
    });
  }

  const event = create(EventEnvelopeSchema, {
    actor: validatedInput.actor,
    causationId: validatedInput.causationId ?? "",
    channel: validatedInput.channel,
    conversation: validatedInput.conversation,
    correlationId: validatedInput.correlationId ?? "",
    eventId: validatedInput.eventId ?? randomUUID(),
    eventType: validatedInput.eventType,
    extensions: validatedInput.extensions ?? {},
    idempotencyKey: validatedInput.idempotencyKey ?? "",
    occurredAt: validatedInput.occurredAt ?? timestampNow(),
    payload: validatedInput.payload,
    protocolVersion: validatedInput.protocolVersion ?? ACP_PROTOCOL_VERSION,
    recipient: validatedInput.recipient,
    source: validatedInput.source,
  });

  validateEvent(event);
  return event;
}

/** Validates event identity, payload mapping, and approval/policy invariants. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Validation keeps envelope invariants at one protocol boundary.
export function validateEvent(event: EventEnvelope): void {
  if (!event.eventId.trim()) {
    throw new ValidationError("ACP event must have an event_id");
  }
  if (!event.eventType.trim()) {
    throw new ValidationError("ACP event must have an event_type");
  }
  if (!event.protocolVersion.trim()) {
    throw new ValidationError("ACP event must have a protocol_version");
  }
  if (!event.occurredAt) {
    throw new ValidationError("ACP event must have occurred_at");
  }
  if (!(event.eventType in PAYLOAD_CASE_BY_EVENT_TYPE)) {
    throw new ValidationError(`Unsupported ACP event type: ${event.eventType}`);
  }

  const expectedPayloadCase = PAYLOAD_CASE_BY_EVENT_TYPE[event.eventType as EventName];
  if (event.payload.case !== expectedPayloadCase) {
    throw new ValidationError(
      `ACP event ${event.eventType} requires payload case ${expectedPayloadCase}, received ${event.payload.case ?? "none"}`,
    );
  }

  if (event.payload.case === "approvalRequested") {
    if (!event.payload.value.approvalId.trim()) {
      throw new ValidationError("approval.requested must have an approval_id");
    }
    if (!(event.payload.value.agent && event.payload.value.approver)) {
      throw new ValidationError("approval.requested must identify an agent and approver");
    }
    if (!event.payload.value.requestedAction) {
      throw new ValidationError("approval.requested must include a requested_action");
    }
    if (!event.payload.value.deadline) {
      throw new ValidationError("approval.requested must have a deadline");
    }
  }

  if (event.payload.case === "approvalDecided") {
    if (!event.payload.value.approvalId.trim()) {
      throw new ValidationError("approval decision must have an approval_id");
    }
    if (
      event.payload.value.outcome !== ApprovalOutcome.GRANTED &&
      event.payload.value.outcome !== ApprovalOutcome.DENIED
    ) {
      throw new ValidationError("approval decision must be granted or denied");
    }
    if (
      event.eventType === "approval.granted" &&
      event.payload.value.outcome !== ApprovalOutcome.GRANTED
    ) {
      throw new ValidationError("approval.granted must have a granted outcome");
    }
    if (
      event.eventType === "approval.denied" &&
      event.payload.value.outcome !== ApprovalOutcome.DENIED
    ) {
      throw new ValidationError("approval.denied must have a denied outcome");
    }
  }

  if (event.payload.case === "policyEvaluated") {
    if (event.eventType === "policy.allowed" && !event.payload.value.allowed) {
      throw new ValidationError("policy.allowed must have allowed=true");
    }
    if (event.eventType === "policy.blocked" && event.payload.value.allowed) {
      throw new ValidationError("policy.blocked must have allowed=false");
    }
  }
}
