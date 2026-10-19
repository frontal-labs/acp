import { describe, expect, it } from "vitest";

import { createTestEvent, createTestEventBus, createTestEventStore } from "../src/index.js";

describe("@acp/testing state helpers", () => {
  it("creates an event bus fixture", async () => {
    const bus = createTestEventBus<string>();
    const values: string[] = [];
    bus.subscribe((value) => {
      values.push(value);
    });

    await bus.publish("event");

    expect(values).toEqual(["event"]);
  });

  it("creates an append-only event store fixture", async () => {
    const store = createTestEventStore<ReturnType<typeof createTestEvent>>();
    const event = createTestEvent({ eventId: "stored" });

    await store.append(event);

    expect(await store.has("stored")).toBe(true);
    expect(await store.all()).toEqual([event]);
  });
});
