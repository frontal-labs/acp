import { create } from "@bufbuild/protobuf";
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";

import type { ProtocolVersion } from "./constants.js";
import { createEvent, type EnvelopeFor, type EventInput } from "./events.js";
import {
  ActionExecutedSchema,
  ActionFailedSchema,
  type ActionRequest,
  type ActorRef,
  ApprovalRequestedSchema,
  type ArtifactRef,
  MessageReceivedSchema,
  MessageSentSchema,
} from "./generated.js";

/** Metadata shared by typed event builders. The envelope version is chosen with `protocolVersion`. */
export type EventBuilderBase<V extends ProtocolVersion = ProtocolVersion> = Omit<
  EventInput<V>,
  "eventType" | "payload"
>;

/** Input for `messageReceived()`. */
export interface MessageReceivedInput<V extends ProtocolVersion = ProtocolVersion>
  extends EventBuilderBase<V> {
  attachments?: ArtifactRef[];
  metadata?: Record<string, string>;
  text: string;
}

/** Input for `messageSent()`. */
export interface MessageSentInput<V extends ProtocolVersion = ProtocolVersion>
  extends EventBuilderBase<V> {
  attachments?: ArtifactRef[];
  metadata?: Record<string, string>;
  text: string;
}

/** Input for `approvalRequested()`; `deadline` accepts a `Date` or protobuf `Timestamp`. */
export interface ApprovalRequestedInput<V extends ProtocolVersion = ProtocolVersion>
  extends EventBuilderBase<V> {
  agent: ActorRef;
  approvalId: string;
  approver: ActorRef;
  deadline?: Date | Timestamp;
  reason: string;
  requestedAction: ActionRequest;
}

/** Input for `actionExecuted()`. */
export interface ActionExecutedInput<V extends ProtocolVersion = ProtocolVersion>
  extends EventBuilderBase<V> {
  action: ActionRequest;
  artifacts?: ArtifactRef[];
  result?: string;
}

/** Input for `actionFailed()`. */
export interface ActionFailedInput<V extends ProtocolVersion = ProtocolVersion>
  extends EventBuilderBase<V> {
  action: ActionRequest;
  errorCode: string;
  errorMessage: string;
  retryable?: boolean;
}

function timestamp(value: Date | Timestamp | undefined): Timestamp | undefined {
  return value instanceof Date ? timestampFromDate(value) : value;
}

/** Builds a typed `message.received` event for the requested protocol version (default v0.1). */
export function messageReceived<V extends ProtocolVersion = "0.1">(
  input: MessageReceivedInput<V>,
): EnvelopeFor<V> {
  return createEvent<V>({
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

/** Builds a typed `message.sent` event for the requested protocol version (default v0.1). */
export function messageSent<V extends ProtocolVersion = "0.1">(
  input: MessageSentInput<V>,
): EnvelopeFor<V> {
  return createEvent<V>({
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

/** Builds a typed `approval.requested` event for the requested protocol version (default v0.1). */
export function approvalRequested<V extends ProtocolVersion = "0.1">(
  input: ApprovalRequestedInput<V>,
): EnvelopeFor<V> {
  return createEvent<V>({
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

/** Builds a typed `action.executed` event for the requested protocol version (default v0.1). */
export function actionExecuted<V extends ProtocolVersion = "0.1">(
  input: ActionExecutedInput<V>,
): EnvelopeFor<V> {
  return createEvent<V>({
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

/** Builds a typed `action.failed` event for the requested protocol version (default v0.1). */
export function actionFailed<V extends ProtocolVersion = "0.1">(
  input: ActionFailedInput<V>,
): EnvelopeFor<V> {
  return createEvent<V>({
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
