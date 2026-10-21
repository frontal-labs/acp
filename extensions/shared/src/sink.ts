import type {
  ChannelSink,
  DeliveryOptions,
  DeliveryReceipt,
} from "@frontal-labs/open-channel-adapter";
import { OpenChannelError, TransportError } from "@frontal-labs/open-channel-core";
import type { EventEnvelope } from "@frontal-labs/open-channel-protocol";

/** Creates a sink with consistent provider transport error classification. */
export function createProviderSink(
  provider: string,
  send: (event: EventEnvelope, options?: DeliveryOptions) => Promise<DeliveryReceipt | undefined>,
): ChannelSink {
  return {
    provider,
    send: async (event, options) => {
      try {
        return (
          (await send(event, options)) ?? {
            deliveredAt: new Date(),
            eventId: event.eventId,
            provider,
          }
        );
      } catch (error) {
        if (error instanceof OpenChannelError) {
          throw error;
        }
        throw new TransportError(`Unable to deliver OCP event through ${provider}`, {
          cause: error,
          eventId: event.eventId,
          provider,
          retryable: true,
          stage: "delivery",
        });
      }
    },
  };
}
