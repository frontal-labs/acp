import { create } from "@bufbuild/protobuf";
import { type Timestamp, timestampFromDate } from "@bufbuild/protobuf/wkt";

import { type EventInput, newEvent } from "./events.js";
import {
  ActionExecutedSchema,
  ActionFailedSchema,
  type ActionRequest,
  type ActorRef,
  ApprovalRequestedSchema,
  type ArtifactRef,
  type EventEnvelope,
  MessageReceivedSchema,
  MessageSentSchema,
} from "./generated.js";

/** Routing and identity fields shared by every typed builder. */
export type EventMeta = Omit<EventInput, "payload">;

/** Input for `messageReceived()`. */
export interface MessageReceivedInput extends EventMeta {
  attachments?: ArtifactRef[];
  metadata?: Record<string, string>;
  text: string;
}

/** Input for `messageSent()`. */
export interface MessageSentInput extends EventMeta {
  attachments?: ArtifactRef[];
  metadata?: Record<string, string>;
  text: string;
}

/** Input for `approvalRequested()`. `deadline` accepts a `Date` or a protobuf `Timestamp`. */
export interface ApprovalRequestedInput extends EventMeta {
  agent: ActorRef;
  approvalId: string;
  approver: ActorRef;
  deadline?: Date | Timestamp;
  reason: string;
  requestedAction: ActionRequest;
}

/** Input for `actionExecuted()`. */
export interface ActionExecutedInput extends EventMeta {
  action: ActionRequest;
  artifacts?: ArtifactRef[];
  result?: string;
}

/** Input for `actionFailed()`. */
export interface ActionFailedInput extends EventMeta {
  action: ActionRequest;
  errorCode: string;
  errorMessage: string;
  retryable?: boolean;
}

function deadline(value: Date | Timestamp): Timestamp {
  return value instanceof Date ? timestampFromDate(value) : value;
}

/** Builds a `message.received` event. */
export function messageReceived({
  attachments,
  metadata,
  text,
  ...meta
}: MessageReceivedInput): EventEnvelope {
  return newEvent({
    ...meta,
    payload: {
      case: "messageReceived",
      value: create(MessageReceivedSchema, { attachments, metadata, text }),
    },
  });
}

/** Builds a `message.sent` event. */
export function messageSent({
  attachments,
  metadata,
  text,
  ...meta
}: MessageSentInput): EventEnvelope {
  return newEvent({
    ...meta,
    payload: {
      case: "messageSent",
      value: create(MessageSentSchema, { attachments, metadata, text }),
    },
  });
}

/** Builds an `approval.requested` event. */
export function approvalRequested({
  agent,
  approvalId,
  approver,
  deadline: due,
  reason,
  requestedAction,
  ...meta
}: ApprovalRequestedInput): EventEnvelope {
  return newEvent({
    ...meta,
    payload: {
      case: "approvalRequested",
      value: create(ApprovalRequestedSchema, {
        agent,
        approvalId,
        approver,
        deadline: due === undefined ? undefined : deadline(due),
        reason,
        requestedAction,
      }),
    },
  });
}

/** Builds an `action.executed` event. */
export function actionExecuted({
  action,
  artifacts,
  result,
  ...meta
}: ActionExecutedInput): EventEnvelope {
  return newEvent({
    ...meta,
    payload: {
      case: "actionExecuted",
      value: create(ActionExecutedSchema, { action, artifacts, result: result ?? "" }),
    },
  });
}

/** Builds an `action.failed` event. */
export function actionFailed({
  action,
  errorCode,
  errorMessage,
  retryable,
  ...meta
}: ActionFailedInput): EventEnvelope {
  return newEvent({
    ...meta,
    payload: {
      case: "actionFailed",
      value: create(ActionFailedSchema, {
        action,
        errorCode,
        errorMessage,
        retryable: retryable ?? false,
      }),
    },
  });
}
