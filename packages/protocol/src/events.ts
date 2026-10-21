import { randomUUID } from "node:crypto";
import { ValidationError } from "@acp/core";
import { create } from "@bufbuild/protobuf";
import { timestampNow } from "@bufbuild/protobuf/wkt";
import {
  type EventEnvelope as GeneratedV2EventEnvelope,
  EventEnvelopeSchema as V2EventEnvelopeSchema,
} from "../../../proto/gen/typescript/v2/api/events_pb.js";

import {
  ACP_PROTOCOL_VERSION,
  ACP_V2_PROTOCOL_VERSION,
  type EVENT_TYPES,
  type ProtocolVersion,
} from "./constants.js";
import { ApprovalOutcome, type EventEnvelope, EventEnvelopeSchema } from "./generated.js";
import { EventInputSchema } from "./schemas.js";

export {
  ACP_PROTOCOL_VERSION,
  ACP_PROTOCOL_VERSIONS,
  ACP_V2_PROTOCOL_VERSION,
  EVENT_TYPES,
  type ProtocolVersion,
} from "./constants.js";

/** Event name shared by every supported protocol version. */
export type EventName = (typeof EVENT_TYPES)[number];
/** Any populated protobuf payload variant. The domain payloads are shared by v0.1 and v0.2. */
export type EventPayload = Exclude<EventEnvelope["payload"], { case: undefined }>;
/** Envelope for the v0.2 payload-discriminated wire format. */
export type V2EventEnvelope = GeneratedV2EventEnvelope;
/** Any ACP envelope, regardless of protocol version. */
export type AcpEvent = EventEnvelope | V2EventEnvelope;
/** The envelope type produced for a given protocol version. */
export type EnvelopeFor<V extends ProtocolVersion> = V extends "0.2"
  ? V2EventEnvelope
  : EventEnvelope;

type PayloadCase = Exclude<EventPayload["case"], undefined>;

const PAYLOAD_CASE_BY_EVENT_TYPE: Record<EventName, PayloadCase> = {
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

/** Event name implied by a payload when the payload alone is ambiguous (approvals and policy decisions). */
const EVENT_TYPE_BY_PAYLOAD_CASE: Record<PayloadCase, EventName> = {
  actionExecuted: "action.executed",
  actionFailed: "action.failed",
  approvalDecided: "approval.granted",
  approvalExpired: "approval.expired",
  approvalRequested: "approval.requested",
  escalationTriggered: "escalation.triggered",
  handoffCompleted: "handoff.completed",
  handoffInitiated: "handoff.initiated",
  messageReceived: "message.received",
  messageSent: "message.sent",
  policyEvaluated: "policy.allowed",
  taskAssigned: "task.assigned",
  taskCreated: "task.created",
};

/**
 * Input used to construct and validate an ACP event envelope for any protocol version.
 * `eventType` is required in both versions: v0.1 stores it, v0.2 uses it to select and check the payload.
 */
export interface EventInput<V extends ProtocolVersion = ProtocolVersion> {
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
  protocolVersion?: V;
  recipient?: EventEnvelope["recipient"];
  source?: EventEnvelope["source"];
}

/** Returns true when the envelope uses the v0.2 layout, where the payload oneof is the event kind. */
export function isV2Event(event: AcpEvent): event is V2EventEnvelope {
  return !("eventType" in event);
}

/** Returns true when the envelope uses the v0.1 layout, which stores the event name. */
export function isV1Event(event: AcpEvent): event is EventEnvelope {
  return !isV2Event(event);
}

/** Returns the event name implied by the payload oneof. */
function payloadEventType(payload: EventPayload): EventName {
  if (payload.case === "approvalDecided") {
    return payload.value.outcome === ApprovalOutcome.DENIED
      ? "approval.denied"
      : "approval.granted";
  }
  if (payload.case === "policyEvaluated") {
    return payload.value.allowed ? "policy.allowed" : "policy.blocked";
  }
  return EVENT_TYPE_BY_PAYLOAD_CASE[payload.case as PayloadCase];
}

/** Returns the dot-separated event name for any ACP envelope, derived from its payload. */
export function eventTypeOf(event: AcpEvent): EventName {
  if (!event.payload.case) {
    throw new ValidationError("ACP event must have a payload");
  }
  return payloadEventType(event.payload);
}

/** v0.2 does not store the event name, so a caller-asserted name must still match the payload. */
function assertAssertedEventType(eventType: EventName, payload: EventPayload): void {
  const expectedCase = PAYLOAD_CASE_BY_EVENT_TYPE[eventType];
  if (payload.case !== expectedCase) {
    throw new ValidationError(
      `ACP event ${eventType} requires payload case ${expectedCase}, received ${payload.case ?? "none"}`,
    );
  }
  const derived = payloadEventType(payload);
  if (derived !== eventType) {
    throw new ValidationError(`ACP event ${eventType} does not match payload event ${derived}`);
  }
}

/** Creates a validated envelope for the requested protocol version (default v0.1). */
export function createEvent<V extends ProtocolVersion = typeof ACP_PROTOCOL_VERSION>(
  input: EventInput<V>,
): EnvelopeFor<V> {
  let validatedInput: EventInput<V>;
  try {
    validatedInput = EventInputSchema.parse(input) as unknown as EventInput<V>;
  } catch (error) {
    throw new ValidationError("Invalid ACP event input", {
      cause: error,
      details: { issues: error instanceof Error ? error.message : String(error) },
    });
  }

  const protocolVersion = validatedInput.protocolVersion ?? ACP_PROTOCOL_VERSION;
  const shared = {
    actor: validatedInput.actor,
    causationId: validatedInput.causationId ?? "",
    channel: validatedInput.channel,
    conversation: validatedInput.conversation,
    correlationId: validatedInput.correlationId ?? "",
    eventId: validatedInput.eventId ?? randomUUID(),
    extensions: validatedInput.extensions ?? {},
    idempotencyKey: validatedInput.idempotencyKey ?? "",
    occurredAt: validatedInput.occurredAt ?? timestampNow(),
    payload: validatedInput.payload,
    protocolVersion,
    recipient: validatedInput.recipient,
    source: validatedInput.source,
  };
  if (protocolVersion === ACP_V2_PROTOCOL_VERSION) {
    assertAssertedEventType(validatedInput.eventType, validatedInput.payload);
  }
  const event: AcpEvent =
    protocolVersion === ACP_V2_PROTOCOL_VERSION
      ? create(V2EventEnvelopeSchema, shared)
      : create(EventEnvelopeSchema, { ...shared, eventType: validatedInput.eventType });

  validateEvent(event);
  return event as EnvelopeFor<V>;
}

/** Validates identity, protocol version, payload mapping, and approval/policy invariants for any version. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Validation keeps envelope invariants at one protocol boundary.
export function validateEvent(event: AcpEvent): void {
  if (!event.eventId.trim()) {
    throw new ValidationError("ACP event must have an event_id");
  }
  if (!event.protocolVersion.trim()) {
    throw new ValidationError("ACP event must have a protocol_version");
  }
  const v2 = isV2Event(event);
  const expectedVersion = v2 ? ACP_V2_PROTOCOL_VERSION : ACP_PROTOCOL_VERSION;
  if (event.protocolVersion !== expectedVersion) {
    throw new ValidationError(
      `ACP ${v2 ? "v0.2" : "v0.1"} envelope requires protocol_version ${expectedVersion}, received ${event.protocolVersion}`,
    );
  }
  if (!event.occurredAt) {
    throw new ValidationError("ACP event must have occurred_at");
  }
  if (!event.payload.case) {
    throw new ValidationError("ACP event must have a payload");
  }
  if (!(v2 || event.eventType.trim())) {
    throw new ValidationError("ACP event must have an event_type");
  }

  const name = v2 ? payloadEventType(event.payload) : event.eventType;
  if (!(name in PAYLOAD_CASE_BY_EVENT_TYPE)) {
    throw new ValidationError(`Unsupported ACP event type: ${name}`);
  }
  const expectedPayloadCase = PAYLOAD_CASE_BY_EVENT_TYPE[name as EventName];
  if (event.payload.case !== expectedPayloadCase) {
    throw new ValidationError(
      `ACP event ${name} requires payload case ${expectedPayloadCase}, received ${event.payload.case}`,
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
    if (name === "approval.granted" && event.payload.value.outcome !== ApprovalOutcome.GRANTED) {
      throw new ValidationError("approval.granted must have a granted outcome");
    }
    if (name === "approval.denied" && event.payload.value.outcome !== ApprovalOutcome.DENIED) {
      throw new ValidationError("approval.denied must have a denied outcome");
    }
  }

  if (event.payload.case === "policyEvaluated") {
    if (name === "policy.allowed" && !event.payload.value.allowed) {
      throw new ValidationError("policy.allowed must have allowed=true");
    }
    if (name === "policy.blocked" && event.payload.value.allowed) {
      throw new ValidationError("policy.blocked must have allowed=false");
    }
  }
}
