import type {
  ChannelAdapter,
  ChannelSink,
  ChannelSource,
  DeliveryOptions,
  DeliveryReceipt,
  ReceiveMetadata,
} from "@acp/adapter";
import { AcpError, TransportError, ValidationError } from "@acp/core";
import type { EventEnvelope } from "@acp/protocol";

import type { AcpRuntime } from "./runtime.js";
import type { RuntimeResult } from "./types.js";

/** Routes normalized ACP events to provider adapters. */
export class ChannelGateway {
  private readonly sinks = new Map<string, ChannelSink>();
  private readonly sources = new Map<string, ChannelSource>();
  private readonly sourceRuns = new Map<string, Promise<void>>();
  readonly runtime: AcpRuntime;

  constructor(runtime: AcpRuntime, adapters: ChannelAdapter[] = []) {
    this.runtime = runtime;
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  register(adapter: ChannelAdapter): void {
    this.sinks.set(adapter.provider, adapter);
  }

  registerSource(source: ChannelSource): void {
    this.sources.set(source.provider, source);
  }

  registerChannel(channel: { sink?: ChannelSink; source?: ChannelSource }): void {
    if (channel.sink) {
      this.register(channel.sink);
    }
    if (channel.source) {
      this.registerSource(channel.source);
    }
  }

  ingest(event: EventEnvelope): Promise<RuntimeResult> {
    return this.runtime.process(event);
  }

  async receive(
    provider: string,
    input: unknown,
    metadata?: ReceiveMetadata,
  ): Promise<RuntimeResult[]> {
    const source = this.sources.get(provider);
    if (!source) {
      throw new TransportError(`No ACP source registered for provider: ${provider}`, {
        details: { provider },
      });
    }

    const normalized = await source.normalize(input, metadata);
    const events = Array.isArray(normalized) ? normalized : [normalized];
    const results: RuntimeResult[] = [];
    for (const event of events) {
      // biome-ignore lint/performance/noAwaitInLoops: Provider event order must be preserved.
      results.push(await this.ingest(event));
    }
    return results;
  }

  start(emit: (event: EventEnvelope) => Promise<void>, signal: AbortSignal): Promise<void> {
    for (const source of this.sources.values()) {
      if (!source.start) {
        continue;
      }
      const run = Promise.resolve(source.start(emit, signal));
      this.sourceRuns.set(
        source.provider,
        run.catch(() => undefined),
      );
      // Keep source failures attached to the lifecycle promise without making startup wait for a
      // long-running polling or websocket source.
    }
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    for (const source of this.sources.values()) {
      if (source.stop) {
        // biome-ignore lint/performance/noAwaitInLoops: Sources are stopped deterministically.
        await source.stop();
      }
    }
    await Promise.allSettled(this.sourceRuns.values());
    this.sourceRuns.clear();
  }

  async dispatch(event: EventEnvelope, options?: DeliveryOptions): Promise<DeliveryReceipt> {
    const provider = event.channel?.provider;
    if (!provider) {
      throw new ValidationError(
        `Cannot dispatch ACP event ${event.eventId}: channel.provider is required`,
      );
    }

    const adapter = this.sinks.get(provider);
    if (!adapter) {
      throw new TransportError(`No ACP adapter registered for provider: ${provider}`, {
        details: { eventId: event.eventId, provider },
      });
    }
    try {
      return await adapter.send(event, options);
    } catch (error) {
      if (error instanceof AcpError) {
        throw error;
      }
      throw new TransportError(`Delivery failed for ACP event ${event.eventId}`, {
        cause: error,
        eventId: event.eventId,
        provider,
        retryable: true,
        stage: "delivery",
      });
    }
  }

  async close(): Promise<void> {
    for (const sink of this.sinks.values()) {
      // biome-ignore lint/performance/noAwaitInLoops: Sinks close deterministically before shutdown completes.
      await sink.close?.();
    }
  }
}
