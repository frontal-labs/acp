import type { CoreEventHandler, EventBus } from "./types.js";

/** An ordered, in-memory event bus suitable for tests and local runtimes. */
export class InMemoryEventBus<TEvent = unknown> implements EventBus<TEvent> {
  private readonly handlers = new Set<CoreEventHandler<TEvent>>();

  async publish(event: TEvent): Promise<void> {
    for (const handler of this.handlers) {
      // biome-ignore lint/performance/noAwaitInLoops: Subscribers are notified in registration order.
      await handler(event);
    }
  }

  subscribe(handler: CoreEventHandler<TEvent>): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
