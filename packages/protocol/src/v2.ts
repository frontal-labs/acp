import { randomUUID } from "node:crypto";

import { ProtocolError, ValidationError } from "@acp/core";
import { create, fromBinary, fromJson, type JsonValue, toBinary, toJson } from "@bufbuild/protobuf";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { timestampFromDate, timestampNow } from "@bufbuild/protobuf/wkt";
import {
  type EventEnvelope as GeneratedV2EventEnvelope,
  EventEnvelopeSchema as V2EventEnvelopeSchema,
} from "../../../proto/gen/typescript/v2/api/events_pb.js";
import {
  ActionExecutedSchema,
  ActionFailedSchema,
  type ActionRequest,
  type ActorRef,
  ApprovalOutcome,
  ApprovalRequestedSchema,
  type ArtifactRef,
  MessageReceivedSchema,
  MessageSentSchema,
  type EventEnvelope as V1EventEnvelope,
} from "./generated.js";

/** ACP v0.2 protocol version used by the typed v2 envelope. */
export const ACP_V2_PROTOCOL_VERSION = "0.2";

/** Friendly event names derived from the v2 payload oneof. */
export const V2_EVENT_TYPES = [
  "message.received",
  "message.sent",
  "task.created",
  "task.assigned",
  "approval.requested",
  "approval.granted",
  "approval.denied",
  "approval.expired",
  "escalation.triggered",
  "handoff.initiated",
  "handoff.completed",
  "policy.allowed",
  "policy.blocked",
  "action.executed",
  "action.failed",
] as const;

export type V2EventName = (typeof V2_EVENT_TYPES)[number];
export type V2EventEnvelope = GeneratedV2EventEnvelope;
export type V2EventPayload = Exclude<V2EventEnvelope["payload"], { case: undefined }>;

/** Common metadata accepted by typed v2 event builders. */
export type V2EventBuilderBase = Omit<V2EventInput, "eventType" | "payload">;

/** Input accepted by the v2 event builder. `eventType` is used only to select/validate the oneof. */
export interface V2EventInput {
  actor?: V2EventEnvelope["actor"];
  causationId?: string;
  channel?: V2EventEnvelope["channel"];
  conversation?: V2EventEnvelope["conversation"];
  correlationId?: string;
  eventId?: string;
  eventType: V2EventName;
  extensions?: Record<string, string>;
  idempotencyKey?: string;
  occurredAt?: V2EventEnvelope["occurredAt"];
  payload: V2EventPayload;
  protocolVersion?: string;
  recipient?: V2EventEnvelope["recipient"];
  source?: V2EventEnvelope["source"];
}

export interface MessageReceivedInput extends V2EventBuilderBase {
  attachments?: ArtifactRef[];
  metadata?: Record<string, string>;
  text: string;
}

export interface MessageSentInput extends V2EventBuilderBase {
  attachments?: ArtifactRef[];
  metadata?: Record<string, string>;
  text: string;
}

export interface ApprovalRequestedInput extends V2EventBuilderBase {
  agent: ActorRef;
  approvalId: string;
  approver: ActorRef;
  deadline?: Date | Timestamp;
  reason: string;
  requestedAction: ActionRequest;
}

export interface ActionExecutedInput extends V2EventBuilderBase {
  action: ActionRequest;
  artifacts?: ArtifactRef[];
  result?: string;
}

export interface ActionFailedInput extends V2EventBuilderBase {
  action: ActionRequest;
  errorCode: string;
  errorMessage: string;
  retryable?: boolean;
}

function timestamp(value: Date | Timestamp | undefined): Timestamp | undefined {
  return value instanceof Date ? timestampFromDate(value) : value;
}

/** Builds a typed `message.received` v2 event. */
export function messageReceived(input: MessageReceivedInput): V2EventEnvelope {
  return createV2Event({
    ...input,
    eventType: "message.received",
    payload: {
      case: "messageReceived",
      value: create(MessageReceivedSchema, {
        attachments: input.attachments,
        metadata: input.metadata,
        text: input.text,
      }),
    },
  });
}

/** Builds a typed `message.sent` v2 event. */
export function messageSent(input: MessageSentInput): V2EventEnvelope {
  return createV2Event({
    ...input,
    eventType: "message.sent",
    payload: {
      case: "messageSent",
      value: create(MessageSentSchema, {
        attachments: input.attachments,
        metadata: input.metadata,
        text: input.text,
      }),
    },
  });
}

/** Builds a typed `approval.requested` v2 event. */
export function approvalRequested(input: ApprovalRequestedInput): V2EventEnvelope {
  return createV2Event({
    ...input,
    eventType: "approval.requested",
    payload: {
      case: "approvalRequested",
      value: create(ApprovalRequestedSchema, {
        agent: input.agent,
        approvalId: input.approvalId,
        approver: input.approver,
        deadline: timestamp(input.deadline),
        reason: input.reason,
        requestedAction: input.requestedAction,
      }),
    },
  });
}

/** Builds a typed `action.executed` v2 event. */
export function actionExecuted(input: ActionExecutedInput): V2EventEnvelope {
  return createV2Event({
    ...input,
    eventType: "action.executed",
    payload: {
      case: "actionExecuted",
      value: create(ActionExecutedSchema, {
        action: input.action,
        artifacts: input.artifacts,
        result: input.result ?? "",
      }),
    },
  });
}

/** Builds a typed `action.failed` v2 event. */
export function actionFailed(input: ActionFailedInput): V2EventEnvelope {
  return createV2Event({
    ...input,
    eventType: "action.failed",
    payload: {
      case: "actionFailed",
      value: create(ActionFailedSchema, {
        action: input.action,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        retryable: input.retryable ?? false,
      }),
    },
  });
}

const PAYLOAD_CASE_BY_EVENT_TYPE: Record<
  V2EventName,
  Exclude<V2EventPayload["case"], undefined>
> = {
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

const EVENT_TYPE_BY_PAYLOAD_CASE: Record<
  Exclude<V2EventPayload["case"], undefined>,
  V2EventName
> = {
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

/** Creates a v2 envelope whose payload oneof is the canonical event kind. */
export function createV2Event(input: V2EventInput): V2EventEnvelope {
  const expectedCase = PAYLOAD_CASE_BY_EVENT_TYPE[input.eventType];
  if (input.payload.case !== expectedCase) {
    throw new ValidationError(
      `ACP v2 event ${input.eventType} requires payload case ${expectedCase}, received ${input.payload.case ?? "none"}`,
    );
  }

  const event = create(V2EventEnvelopeSchema, {
    actor: input.actor,
    causationId: input.causationId ?? "",
    channel: input.channel,
    conversation: input.conversation,
    correlationId: input.correlationId ?? "",
    eventId: input.eventId ?? randomUUID(),
    extensions: input.extensions ?? {},
    idempotencyKey: input.idempotencyKey ?? "",
    occurredAt: input.occurredAt ?? timestampNow(),
    payload: input.payload,
    protocolVersion: input.protocolVersion ?? ACP_V2_PROTOCOL_VERSION,
    recipient: input.recipient,
    source: input.source,
  });
  validateV2Event(event);
  return event;
}

/** Returns the friendly dot-separated event name derived from the payload oneof. */
export function v2EventType(event: V2EventEnvelope): V2EventName {
  if (!event.payload.case) {
    throw new ValidationError("ACP v2 event must have a payload");
  }
  if (event.payload.case === "approvalDecided") {
    return event.payload.value.outcome === ApprovalOutcome.DENIED
      ? "approval.denied"
      : "approval.granted";
  }
  if (event.payload.case === "policyEvaluated") {
    return event.payload.value.allowed ? "policy.allowed" : "policy.blocked";
  }
  return EVENT_TYPE_BY_PAYLOAD_CASE[event.payload.case];
}

/** Validates required v2 envelope fields and oneof semantics. */
export function validateV2Event(event: V2EventEnvelope): void {
  if (!event.eventId.trim()) {
    throw new ValidationError("ACP v2 event must have an event_id");
  }
  if (!event.protocolVersion.trim()) {
    throw new ValidationError("ACP v2 event must have a protocol_version");
  }
  if (!event.occurredAt) {
    throw new ValidationError("ACP v2 event must have occurred_at");
  }
  const type = v2EventType(event);
  if (!V2_EVENT_TYPES.includes(type)) {
    throw new ValidationError(`Unsupported ACP v2 event type: ${type}`);
  }
}

/** Serializes a validated v2 envelope to ProtoJSON. */
export function v2EventToJson(event: V2EventEnvelope): JsonValue {
  validateV2Event(event);
  return toJson(V2EventEnvelopeSchema, event);
}

/** Parses and validates a v2 ProtoJSON envelope. */
export function v2EventFromJson(value: unknown): V2EventEnvelope {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Invalid ACP v2 ProtoJSON envelope");
  }
  try {
    const event = fromJson(V2EventEnvelopeSchema, value as JsonValue);
    validateV2Event(event);
    return event;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ProtocolError("Unable to decode ACP v2 ProtoJSON envelope", { cause: error });
  }
}

/** Serializes a validated v2 envelope to binary protobuf. */
export function v2EventToBinary(event: V2EventEnvelope): Uint8Array {
  validateV2Event(event);
  return toBinary(V2EventEnvelopeSchema, event);
}

/** Parses and validates a v2 binary protobuf envelope. */
export function v2EventFromBinary(value: Uint8Array): V2EventEnvelope {
  try {
    const event = fromBinary(V2EventEnvelopeSchema, value);
    validateV2Event(event);
    return event;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ProtocolError("Unable to decode ACP v2 binary envelope", { cause: error });
  }
}

/** Parses a v2 ProtoJSON object or binary protobuf payload. */
export function parseEvent(value: unknown): V2EventEnvelope {
  return value instanceof Uint8Array ? v2EventFromBinary(value) : v2EventFromJson(value);
}

/** Marks the v1 envelope type as intentionally separate from v2 at API boundaries. */
export type LegacyV1EventEnvelope = V1EventEnvelope;
