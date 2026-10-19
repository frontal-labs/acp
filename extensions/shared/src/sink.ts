import type { ChannelSink, DeliveryOptions, DeliveryReceipt } from "@acp/adapter";
import { AcpError, TransportError } from "@acp/core";
import type { EventEnvelope } from "@acp/protocol";

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
        if (error instanceof AcpError) {
          throw error;
        }
        throw new TransportError(`Unable to deliver ACP event through ${provider}`, {
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
