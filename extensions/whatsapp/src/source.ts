import { create } from "@bufbuild/protobuf";
import type { ChannelSource } from "@frontal-labs/open-channel-adapter";
import {
  createProviderSource,
  optionalRecord,
  optionalString,
  providerActor,
  providerEvent,
  records,
  sourceRecord,
} from "@frontal-labs/open-channel-ext-shared";
import { MessageReceivedSchema } from "@frontal-labs/open-channel-protocol";

import type { WhatsAppSourceOptions } from "./types.js";

/** Normalizes WhatsApp Business Cloud webhook messages into OCP events. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Provider payload variants are normalized in one boundary function.
export async function normalizeWhatsAppEvent(
  input: unknown,
  metadata: import("@frontal-labs/open-channel-ext-shared").ProviderReceiveMetadata = {},
  options: WhatsAppSourceOptions = {},
) {
  const body = sourceRecord(input, "WhatsApp");
  for (const entry of records(body.entry)) {
    for (const change of records(entry.changes)) {
      const value = optionalRecord(change.value);
      const messages = records(value?.messages);
      const [message] = messages;
      if (!message) {
        continue;
      }
      const from = optionalString(message, "from");
      const metadataRecord = optionalRecord(value?.metadata);
      const phoneNumberId = optionalString(metadataRecord ?? {}, "phone_number_id");
      if (!(from && phoneNumberId)) {
        continue;
      }
      if (options.businessPhoneNumberId && phoneNumberId !== options.businessPhoneNumberId) {
        continue;
      }
      const actor = options.actorResolver
        ? // biome-ignore lint/performance/noAwaitInLoops: Preserve provider message order.
          await options.actorResolver(from)
        : providerActor(`whatsapp:${from}`, from);
      const textRecord = optionalRecord(message.text);
      const eventId = metadata.eventId ?? optionalString(message, "id");
      return providerEvent(
        {
          actor,
          address: from,
          channelId: phoneNumberId,
          conversationId: `whatsapp:${from}`,
          conversationParticipants: [actor],
          eventType: "message.received",
          extensions: {
            "ocp.provider": "whatsapp",
            "whatsapp.phone_number_id": phoneNumberId,
            ...(eventId ? { "whatsapp.message_id": eventId } : {}),
          },
          payload: {
            case: "messageReceived",
            value: create(MessageReceivedSchema, {
              metadata: { messageType: optionalString(message, "type") ?? "text", phone: from },
              text: optionalString(textRecord ?? {}, "body") ?? "",
            }),
          },
          recipient: options.recipient,
          threadId: eventId,
        },
        { ...metadata, eventId, idempotencyKey: metadata.idempotencyKey ?? eventId },
      );
    }
  }
  return [];
}

/** Creates a WhatsApp source for `createOcp({ channels })`. */
export function createWhatsAppSource(options: WhatsAppSourceOptions = {}): ChannelSource {
  return createProviderSource("whatsapp", (input, metadata) =>
    normalizeWhatsAppEvent(input, metadata, options),
  );
}
