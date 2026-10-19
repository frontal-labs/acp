import { describe, expect, it } from "vitest";

import {
  createActionId,
  createCorrelationId,
  InMemoryEventBus,
  ValidationError,
} from "../src/index.js";

const ACTION_ID_PATTERN = /^action:[0-9a-f-]{36}$/;
const CORRELATION_ID_PATTERN = /^corr:[0-9a-f-]{36}$/;

describe("@acp/core", () => {
  it("publishes in order and unsubscribes handlers", async () => {
    const bus = new InMemoryEventBus<string>();
    const received: string[] = [];
    const unsubscribe = bus.subscribe((event) => {
      received.push(event);
    });

    await bus.publish("first");
    unsubscribe();
    await bus.publish("second");

    expect(received).toEqual(["first"]);
  });

  it("creates namespaced identifiers and classified errors", () => {
    expect(createActionId()).toMatch(ACTION_ID_PATTERN);
    expect(createCorrelationId()).toMatch(CORRELATION_ID_PATTERN);
    expect(new ValidationError("invalid").code).toBe("ACP_VALIDATION");
  });
});
