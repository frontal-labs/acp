import { deliveryReceipt } from "@frontal-labs/open-channel";
import type {
  ChannelSink,
  DeliveryOptions,
  DeliveryReceipt,
} from "@frontal-labs/open-channel-adapter";
import { createProviderSink } from "@frontal-labs/open-channel-ext-shared";

import type { EmailTransport } from "./types.js";

/** Creates an SMTP/provider email sink for OCP message.sent events. */
export function createEmailSink(transport: EmailTransport): ChannelSink {
  return createProviderSink(
    "email",
    async (event, options?: DeliveryOptions): Promise<DeliveryReceipt | undefined> => {
      if (event.eventType !== "message.sent" || event.payload.case !== "messageSent") {
        return undefined;
      }
      const recipient = event.recipient?.id ?? event.channel?.address;
      if (!recipient) {
        return undefined;
      }
      const result = await transport.sendEmail({
        from: event.actor?.id ?? "",
        id: event.eventId,
        idempotencyKey: options?.idempotencyKey ?? event.idempotencyKey,
        inReplyTo: event.extensions["email.message_id"],
        signal: options?.signal,
        subject: event.extensions["email.subject"]
          ? `Re: ${event.extensions["email.subject"]}`
          : "OCP message",
        text: event.payload.value.text,
        to: [recipient],
      });
      return deliveryReceipt("email", event, result.messageId);
    },
  );
}
