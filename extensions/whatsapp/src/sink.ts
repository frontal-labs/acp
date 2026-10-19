import type { ChannelSink, DeliveryOptions, DeliveryReceipt } from "@acp/adapter";
import { createProviderSink } from "@acp/ext-shared";
import { deliveryReceipt } from "acp-sdk";

import type { WhatsAppTransport } from "./types.js";

/** Creates a WhatsApp Business sink for ACP message.sent events. */
export function createWhatsAppSink(
  transport: WhatsAppTransport,
  phoneNumberId: string,
): ChannelSink {
  return createProviderSink(
    "whatsapp",
    async (event, options?: DeliveryOptions): Promise<DeliveryReceipt | undefined> => {
      if (event.eventType !== "message.sent" || event.payload.case !== "messageSent") {
        return undefined;
      }
      const to = event.recipient?.id ?? event.channel?.address;
      if (!to) {
        return undefined;
      }
      const result = await transport.sendMessage({
        idempotencyKey: options?.idempotencyKey ?? event.idempotencyKey,
        phoneNumberId,
        signal: options?.signal,
        text: event.payload.value.text,
        to,
      });
      return deliveryReceipt("whatsapp", event, result.messageId);
    },
  );
}
