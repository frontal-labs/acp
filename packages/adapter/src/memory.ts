import type { EventEnvelope } from "@acp/protocol";

import type { ChannelAdapter, DeliveryOptions, DeliveryReceipt } from "./types.js";

/** Records outbound events in memory for tests and local development. */
export class InMemoryChannelAdapter implements ChannelAdapter {
  readonly provider = "memory";
  readonly sent: EventEnvelope[] = [];

  send(_event: EventEnvelope, _options?: DeliveryOptions): Promise<DeliveryReceipt> {
    const event = _event;
    this.sent.push(event);
    return Promise.resolve({
      deliveredAt: new Date(),
      eventId: event.eventId,
      provider: this.provider,
    });
  }
}
