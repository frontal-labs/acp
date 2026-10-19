import type { EventEnvelope } from "@acp/protocol";

import type { EventStore } from "./types.js";

/** Simple append-only in-memory event store for local runtimes. */
export class InMemoryEventStore implements EventStore {
  private readonly events = new Map<string, EventEnvelope>();

  has(eventId: string): Promise<boolean> {
    return Promise.resolve(this.events.has(eventId));
  }

  append(event: EventEnvelope): Promise<void> {
    this.events.set(event.eventId, event);
    return Promise.resolve();
  }

  appendIfAbsent(event: EventEnvelope): Promise<boolean> {
    if (this.events.has(event.eventId)) {
      return Promise.resolve(false);
    }
    this.events.set(event.eventId, event);
    return Promise.resolve(true);
  }

  get(eventId: string): Promise<EventEnvelope | undefined> {
    return Promise.resolve(this.events.get(eventId));
  }

  list(options: { eventType?: string; limit?: number } = {}): Promise<EventEnvelope[]> {
    const events = [...this.events.values()].filter(
      (event) => !options.eventType || event.eventType === options.eventType,
    );
    return Promise.resolve(options.limit === undefined ? events : events.slice(-options.limit));
  }

  all(): Promise<EventEnvelope[]> {
    return Promise.resolve([...this.events.values()]);
  }
}
