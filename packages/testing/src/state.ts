import { InMemoryEventBus } from "@acp/core";

/** Creates the shared in-memory event bus used by focused package tests. */
export function createTestEventBus<TEvent = unknown>(): InMemoryEventBus<TEvent> {
  return new InMemoryEventBus<TEvent>();
}

/** Minimal append-only event store contract for runtime test doubles. */
export interface TestEventStore<TEvent extends { eventId: string }> {
  all: () => Promise<TEvent[]>;
  append: (event: TEvent) => Promise<void>;
  has: (eventId: string) => Promise<boolean>;
}

/** Creates a deterministic in-memory event store fixture compatible with ACP runtimes. */
export function createTestEventStore<TEvent extends { eventId: string }>(): TestEventStore<TEvent> {
  const events = new Map<string, TEvent>();
  return {
    all: () => Promise.resolve([...events.values()]),
    append: (event) => {
      events.set(event.eventId, event);
      return Promise.resolve();
    },
    has: (eventId) => Promise.resolve(events.has(eventId)),
  };
}
