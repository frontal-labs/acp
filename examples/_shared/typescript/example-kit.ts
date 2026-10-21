import type { ChannelDefinition } from "@frontal-labs/open-channel";
import type { EventEnvelope } from "@frontal-labs/open-channel-protocol";
import type { ActionExecutionRecord, EventStore } from "@frontal-labs/open-channel-runtime";

/**
 * In-memory event store for examples only. OCP requires an explicit `eventStore`; production
 * deployments use a durable store such as `@frontal-labs/open-channel-ext-postgres`. Nothing here survives a restart.
 */
export function createExampleEventStore(): EventStore {
  const events = new Map<string, EventEnvelope>();
  const actions = new Map<string, ActionExecutionRecord>();

  return {
    all: () => Promise.resolve([...events.values()]),
    append: (event) => {
      events.set(event.eventId, event);
      return Promise.resolve();
    },
    appendIfAbsent: (event) => {
      if (events.has(event.eventId)) {
        return Promise.resolve(false);
      }
      events.set(event.eventId, event);
      return Promise.resolve(true);
    },
    claimAction: (actionId, owner) => {
      if (actions.has(actionId)) {
        return Promise.resolve(false);
      }
      actions.set(actionId, { actionId, owner, status: "claimed" });
      return Promise.resolve(true);
    },
    completeAction: (actionId, result) => {
      actions.set(actionId, { actionId, result, status: "completed" });
      return Promise.resolve();
    },
    failAction: (actionId, error) => {
      actions.set(actionId, { actionId, error, status: "failed" });
      return Promise.resolve();
    },
    get: (eventId) => Promise.resolve(events.get(eventId)),
    getAction: (actionId) => Promise.resolve(actions.get(actionId)),
    has: (eventId) => Promise.resolve(events.has(eventId)),
    list: (options = {}) => Promise.resolve(filterEvents([...events.values()], options)),
    query: (options = {}) => Promise.resolve(filterEvents([...events.values()], options)),
  };
}

function filterEvents(
  events: EventEnvelope[],
  options: { eventType?: string; limit?: number },
): EventEnvelope[] {
  const matching = options.eventType
    ? events.filter((event) => event.eventType === options.eventType)
    : events;
  return options.limit === undefined ? matching : matching.slice(-options.limit);
}

/**
 * Example channel that records outbound events in memory. A real channel implements the same
 * `source` (normalize provider input) and `sink` (deliver events) contracts; see extensions/slack.
 */
export function createExampleChannel(provider = "example"): {
  channel: ChannelDefinition;
  sent: EventEnvelope[];
} {
  const sent: EventEnvelope[] = [];
  return {
    channel: {
      provider,
      sink: {
        provider,
        send: (event) => {
          sent.push(event);
          return Promise.resolve({ deliveredAt: new Date(), eventId: event.eventId, provider });
        },
      },
      source: {
        normalize: (input) => Promise.resolve(input as EventEnvelope),
        provider,
      },
    },
    sent,
  };
}
