import { create } from "@bufbuild/protobuf";
import type { ChannelSource } from "@frontal-labs/open-channel-adapter";
import {
  createProviderSource,
  optionalRecord,
  optionalString,
  providerActor,
  providerEvent,
  sourceRecord,
} from "@frontal-labs/open-channel-ext-shared";
import { MessageReceivedSchema } from "@frontal-labs/open-channel-protocol";

import type { GoogleChatSourceOptions } from "./types.js";

/** Normalizes Google Chat app events into v1 OCP message events. */
export async function normalizeGoogleChatEvent(
  input: unknown,
  metadata: import("@frontal-labs/open-channel-ext-shared").ProviderReceiveMetadata = {},
  options: GoogleChatSourceOptions = {},
) {
  const body = sourceRecord(input, "Google Chat");
  if (optionalString(body, "type") && optionalString(body, "type") !== "MESSAGE") {
    return [];
  }
  const message = optionalRecord(body.message) ?? body;
  const sender = optionalRecord(message.sender);
  const actorId = optionalString(sender ?? {}, "name") ?? optionalString(sender ?? {}, "email");
  const space = optionalRecord(body.space) ?? optionalRecord(message.space);
  const spaceName = optionalString(space ?? {}, "name") ?? optionalString(message, "space");
  if (!(actorId && spaceName)) {
    return [];
  }
  if (options.appId && actorId === options.appId) {
    return [];
  }
  const actor = options.actorResolver
    ? await options.actorResolver(actorId)
    : providerActor(
        `google-chat:${actorId}`,
        optionalString(sender ?? {}, "displayName") ?? actorId,
      );
  const eventId =
    metadata.eventId ?? optionalString(body, "eventId") ?? optionalString(message, "name");
  const thread = optionalRecord(message.thread);
  return providerEvent(
    {
      actor,
      channelId: spaceName,
      conversationId: `google-chat:${spaceName}`,
      conversationParticipants: [actor],
      extensions: { "ocp.provider": "google-chat" },
      payload: {
        case: "messageReceived",
        value: create(MessageReceivedSchema, { text: optionalString(message, "text") ?? "" }),
      },
      recipient: options.recipient,
      threadId: optionalString(thread ?? {}, "name"),
    },
    { ...metadata, eventId, idempotencyKey: metadata.idempotencyKey ?? eventId },
  );
}

/** Creates a Google Chat source for `openChannel({ channels })`. */
export function createGoogleChatSource(options: GoogleChatSourceOptions = {}): ChannelSource {
  return createProviderSource("google-chat", (input, metadata) =>
    normalizeGoogleChatEvent(input, metadata, options),
  );
}
