import type {
  ChannelSink,
  DeliveryOptions,
  DeliveryReceipt,
} from "@frontal-labs/open-channel-adapter";
import { createProviderSink } from "@frontal-labs/open-channel-ext-shared";
import { deliveryReceipt } from "openchannel";

import type { SlackTransport } from "./types.js";

/** Creates a Slack `ChannelSink` for `openChannel({ channels })`. */
export function createSlackSink(transport: SlackTransport): ChannelSink {
  return createProviderSink(
    "slack",
    async (event, options?: DeliveryOptions): Promise<DeliveryReceipt | undefined> => {
      if (event.payload.case !== "messageSent") {
        return undefined;
      }
      const channelId = event.channel?.channelId;
      if (!channelId) {
        return undefined;
      }
      const message = event.payload.value;
      const result = await transport.postMessage({
        attachments: message.attachments,
        channelId,
        idempotencyKey: options?.idempotencyKey ?? event.idempotencyKey,
        signal: options?.signal,
        text: message.text,
        threadId: event.channel?.threadId,
      });
      return deliveryReceipt("slack", event, result.messageId);
    },
  );
}
