import type { EventEnvelope } from "@acp/protocol";

/** Metadata supplied by a provider when normalizing inbound input. */
export interface ReceiveMetadata {
  eventId?: string;
  idempotencyKey?: string;
  receivedAt?: Date;
}

/** Options supplied to an outbound provider delivery. */
export interface DeliveryOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/** Provider receipt returned after an outbound event is accepted. */
export interface DeliveryReceipt {
  deliveredAt: Date;
  eventId: string;
  externalId?: string;
  provider: string;
}

/** Normalizes provider-native inbound input into ACP events. */
export interface ChannelSource {
  normalize: (
    input: unknown,
    metadata?: ReceiveMetadata,
  ) => Promise<EventEnvelope | EventEnvelope[]> | EventEnvelope | EventEnvelope[];
  readonly provider: string;
  start?: (
    emit: (event: EventEnvelope) => Promise<void>,
    signal: AbortSignal,
  ) => Promise<void> | void;
  stop?: () => Promise<void> | void;
}

/** Delivers normalized ACP events to a provider. */
export interface ChannelSink {
  readonly provider: string;
  send: (event: EventEnvelope, options?: DeliveryOptions) => Promise<DeliveryReceipt | undefined>;
}

/** Combined provider contract for adapters that support both directions. */
export interface ChannelConnector extends ChannelSource, ChannelSink {}

/** Backwards-compatible name for the outbound sink contract. */
export type ChannelAdapter = ChannelSink;
