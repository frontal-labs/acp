import type { EventEnvelope, EventName } from "@frontal-labs/open-channel-protocol";

/** Returns event types in their original order. */
export function eventTypes(events: readonly Pick<EventEnvelope, "eventType">[]): string[] {
  return events.map((event) => event.eventType);
}

/** Returns all events with the requested event type. */
export function eventsOfType(
  events: readonly EventEnvelope[],
  eventType: EventName,
): EventEnvelope[] {
  return events.filter((event) => event.eventType === eventType);
}

/** Returns the first event with the requested type, if one exists. */
export function findEvent(
  events: readonly EventEnvelope[],
  eventType: EventName,
): EventEnvelope | undefined {
  return events.find((event) => event.eventType === eventType);
}

/** Returns the first event with the requested type or throws a useful test error. */
export function requireEvent(
  events: readonly EventEnvelope[],
  eventType: EventName,
): EventEnvelope {
  const event = findEvent(events, eventType);
  if (!event) {
    throw new Error(`Expected OCP event ${eventType}; received ${eventTypes(events).join(", ")}`);
  }
  return event;
}

/** Records values while preserving insertion order for assertions. */
export interface TestRecorder<TValue> {
  clear: () => void;
  record: (value: TValue) => void;
  readonly values: TValue[];
}

/** Creates a simple recorder for events, calls, or other test observations. */
export function createTestRecorder<TValue>(): TestRecorder<TValue> {
  const values: TValue[] = [];
  return {
    clear: () => {
      values.length = 0;
    },
    record: (value) => {
      values.push(value);
    },
    values,
  };
}
