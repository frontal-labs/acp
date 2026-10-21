import type {
  ActorRef,
  EventEnvelope,
  EventName,
  EventPayload,
} from "@frontal-labs/open-channel-protocol";

/** Provider-neutral input metadata supplied by a webhook, queue, or poller. */
export interface ProviderReceiveMetadata {
  eventId?: string;
  idempotencyKey?: string;
  receivedAt?: Date;
}

/** Common fields used to construct a normalized OCP event. */
export interface ProviderEventOptions {
  actor?: ActorRef;
  address?: string;
  channel?: EventEnvelope["channel"];
  channelId?: string;
  conversation?: EventEnvelope["conversation"];
  conversationId?: string;
  conversationParticipants?: ActorRef[];
  eventType: EventName;
  extensions?: Record<string, string>;
  payload: EventPayload;
  recipient?: ActorRef;
  source?: ActorRef;
  threadId?: string;
}

/** Minimal JSON object accepted at an untrusted provider boundary. */
export type ProviderRecord = Record<string, unknown>;

/** A provider transport can send a normalized OCP event. */
export type ProviderSend = (
  event: EventEnvelope,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
) => Promise<import("@frontal-labs/open-channel-adapter").DeliveryReceipt | undefined>;
