import { deliveryReceipt } from "@frontal-labs/open-channel";
import type {
  ChannelSink,
  DeliveryOptions,
  DeliveryReceipt,
} from "@frontal-labs/open-channel-adapter";
import { createProviderSink } from "@frontal-labs/open-channel-ext-shared";

import type { GoogleChatTransport } from "./types.js";

/** Creates a Google Chat sink for `openChannel({ channels })`. */
export function createGoogleChatSink(transport: GoogleChatTransport): ChannelSink {
  return createProviderSink(
    "google-chat",
    async (event, options?: DeliveryOptions): Promise<DeliveryReceipt | undefined> => {
      if (event.payload.case !== "messageSent") {
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
