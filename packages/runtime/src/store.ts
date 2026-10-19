import type { EventEnvelope } from "@acp/protocol";

import type { ActionExecutionRecord, EventStore } from "./types.js";

/** Simple append-only in-memory event store for local runtimes. */
export class InMemoryEventStore implements EventStore {
  private readonly events = new Map<string, EventEnvelope>();
  private readonly actions = new Map<string, ActionExecutionRecord>();

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

  query(options: { eventType?: string; limit?: number } = {}): Promise<EventEnvelope[]> {
    return this.list(options);
  }

  all(): Promise<EventEnvelope[]> {
    return Promise.resolve([...this.events.values()]);
  }

  claimAction(actionId: string, owner: string): Promise<boolean> {
    if (this.actions.has(actionId)) {
      return Promise.resolve(false);
    }
    this.actions.set(actionId, { actionId, owner, status: "claimed" });
    return Promise.resolve(true);
  }

  completeAction(actionId: string, result: unknown): Promise<void> {
    const current = this.actions.get(actionId);
    this.actions.set(actionId, {
      actionId,
      owner: current?.owner,
      result,
      status: "completed",
    });
    return Promise.resolve();
  }

  failAction(actionId: string, error: unknown): Promise<void> {
    const current = this.actions.get(actionId);
    this.actions.set(actionId, {
      actionId,
      error,
      owner: current?.owner,
      status: "failed",
    });
    return Promise.resolve();
  }

  getAction(actionId: string): Promise<ActionExecutionRecord | undefined> {
    return Promise.resolve(this.actions.get(actionId));
  }

  close(): void {
    // In-memory state has no external resources to close.
  }
}
