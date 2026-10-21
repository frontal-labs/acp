import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { ActorRef, EventEnvelope } from "@frontal-labs/open-channel-protocol";
import {
  ActorRefSchema,
  ActorType,
  ChannelRefSchema,
  ConversationRefSchema,
  ConversationStatus,
  newEvent,
} from "@frontal-labs/open-channel-protocol";

import type { ProviderEventOptions, ProviderReceiveMetadata } from "./types.js";

/** Creates a provider-neutral actor reference from an external provider identity. */
export function providerActor(
  id: string,
  displayName: string,
  type: ActorType = ActorType.HUMAN,
  authority = "",
  capabilities: string[] = [],
): ActorRef {
  return create(ActorRefSchema, { authority, capabilities, displayName, id, type });
}

/** Creates a validated v1 OCP event from provider-normalized fields. */
export function providerEvent(
  options: ProviderEventOptions,
  metadata: ProviderReceiveMetadata = {},
): EventEnvelope {
  const channel =
    options.channel ??
    (options.channelId
      ? create(ChannelRefSchema, {
          address: options.address,
          channelId: options.channelId,
          provider: options.extensions?.["ocp.provider"] ?? "",
          threadId: options.threadId,
        })
      : undefined);
  const conversation =
    options.conversation ??
    (options.conversationId
      ? create(ConversationRefSchema, {
          id: options.conversationId,
          participants: options.conversationParticipants ?? [],
          status: ConversationStatus.OPEN,
        })
      : undefined);

  return newEvent({
    actor: options.actor,
    causationId: options.extensions?.["ocp.causation_id"],
    channel,
    conversation,
    eventId: metadata.eventId,
    extensions: options.extensions,
    idempotencyKey: metadata.idempotencyKey,
    occurredAt: metadata.receivedAt ? timestampFromDate(metadata.receivedAt) : undefined,
    payload: options.payload,
    recipient: options.recipient,
    source: options.source ?? options.actor,
  });
}
