import { deliveryReceipt } from "@frontal-labs/open-channel";
import type {
  ChannelSink,
  DeliveryOptions,
  DeliveryReceipt,
} from "@frontal-labs/open-channel-adapter";
import { createProviderSink } from "@frontal-labs/open-channel-ext-shared";

import type { TeamsTransport } from "./types.js";

/** Creates a Teams sink for `openChannel({ channels })`. */
export function createTeamsSink(transport: TeamsTransport): ChannelSink {
  return createProviderSink(
    "microsoft-teams",
    async (event, options?: DeliveryOptions): Promise<DeliveryReceipt | undefined> => {
      if (event.payload.case !== "messageSent") {
        return undefined;
      }
      const conversationId = event.channel?.channelId;
      if (!conversationId) {
        return undefined;
      }
      const result = await transport.sendMessage({
        attachments: event.payload.value.attachments,
        conversationId,
        idempotencyKey: options?.idempotencyKey ?? event.idempotencyKey,
        replyToId: event.channel?.threadId,
        signal: options?.signal,
        text: event.payload.value.text,
      });
      return deliveryReceipt("microsoft-teams", event, result.messageId);
    },
  );
}
