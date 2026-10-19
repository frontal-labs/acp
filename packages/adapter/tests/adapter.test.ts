import { createTestEvent } from "@acp/testing";
import { describe, expect, it } from "vitest";
import { InMemoryChannelAdapter } from "../src/index.js";

describe("@acp/adapter", () => {
  it("records outbound events in memory", async () => {
    const adapter = new InMemoryChannelAdapter();
    const event = createTestEvent({ eventType: "message.sent", text: "hello" });

    await adapter.send(event);

    expect(adapter.provider).toBe("memory");
    expect(adapter.sent).toEqual([event]);
  });
});
