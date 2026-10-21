import { deliveryReceipt } from "@frontal-labs/open-channel";
import type {
  ChannelSink,
  DeliveryOptions,
  DeliveryReceipt,
} from "@frontal-labs/open-channel-adapter";
import { createProviderSink } from "@frontal-labs/open-channel-ext-shared";

import type { A2ATransport } from "./types.js";

/** Creates an A2A sink for OCP message.sent events. */
export function createA2ASink(transport: A2ATransport): ChannelSink {
  return createProviderSink(
    "a2a",
    async (event, options?: DeliveryOptions): Promise<DeliveryReceipt | undefined> => {
      if (event.eventType !== "message.sent" || event.payload.case !== "messageSent") {
        return undefined;
      }
      const result = await transport.sendMessage({
        contextId: event.conversation?.id,
        idempotencyKey: options?.idempotencyKey ?? event.idempotencyKey,
        signal: options?.signal,
        taskId: event.extensions["a2a.task_id"],
        text: event.payload.value.text,
      });
      return deliveryReceipt("a2a", event, result.externalId);
    },
  );
}
