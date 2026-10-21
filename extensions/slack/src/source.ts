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

import type { SlackSourceOptions } from "./types.js";

/** Normalizes Slack Events API message payloads into v1 OCP events. */
export async function normalizeSlackEvent(
  input: unknown,
  metadata: import("@frontal-labs/open-channel-ext-shared").ProviderReceiveMetadata = {},
  options: SlackSourceOptions = {},
) {
  const envelope = sourceRecord(input, "Slack");
  if (optionalString(envelope, "type") === "url_verification") {
    return [];
  }
  const event = optionalRecord(envelope.event) ?? envelope;
  if (optionalString(event, "type") !== "message") {
    return [];
  }
  if (optionalString(event, "subtype") === "bot_message" || optionalString(event, "bot_id")) {
    return [];
  }
  const userId = optionalString(event, "user");
  const channelId = optionalString(event, "channel");
  if (!(userId && channelId)) {
    return [];
  }
  if (options.botUserId && userId === options.botUserId) {
    return [];
  }
  const actor = options.actorResolver
    ? await options.actorResolver(userId)
    : providerActor(`slack:${userId}`, userId);
  const threadId = optionalString(event, "thread_ts") ?? optionalString(event, "ts");
  const eventId =
    metadata.eventId ??
    optionalString(envelope, "event_id") ??
    optionalString(event, "client_msg_id");
  return providerEvent(
    {
      actor,
      channelId,
      conversationId: `slack:${channelId}`,
      conversationParticipants: [actor],
      extensions: {
        "ocp.provider": "slack",
        ...(optionalString(event, "ts")
          ? { "slack.message_ts": optionalString(event, "ts") as string }
          : {}),
      },
      payload: {
        case: "messageReceived",
        value: create(MessageReceivedSchema, { text: optionalString(event, "text") ?? "" }),
      },
      recipient: options.recipient,
      threadId,
    },
    { ...metadata, eventId, idempotencyKey: metadata.idempotencyKey ?? eventId },
  );
}

/** Creates a Slack `ChannelSource` for `openChannel({ channels })`. */
export function createSlackSource(options: SlackSourceOptions = {}): ChannelSource {
  return createProviderSource("slack", (input, metadata) =>
    normalizeSlackEvent(input, metadata, options),
  );
}
