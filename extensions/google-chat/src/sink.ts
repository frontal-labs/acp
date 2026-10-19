import type { ChannelSink, DeliveryOptions, DeliveryReceipt } from "@acp/adapter";
import { createProviderSink } from "@acp/ext-shared";
import { deliveryReceipt } from "acp-sdk";

import type { GoogleChatTransport } from "./types.js";

/** Creates a Google Chat sink for `createAcp({ channels })`. */
export function createGoogleChatSink(transport: GoogleChatTransport): ChannelSink {
  return createProviderSink(
    "google-chat",
    async (event, options?: DeliveryOptions): Promise<DeliveryReceipt | undefined> => {
      if (event.eventType !== "message.sent" || event.payload.case !== "messageSent") {
        return undefined;
      }
      const space = event.channel?.channelId;
      if (!space) {
        return undefined;
      }
      const result = await transport.createMessage({
        attachments: event.payload.value.attachments,
        idempotencyKey: options?.idempotencyKey ?? event.idempotencyKey,
        signal: options?.signal,
        space,
        text: event.payload.value.text,
        thread: event.channel?.threadId,
      });
      return deliveryReceipt("google-chat", event, result.messageId);
    },
  );
}
