import { createTestChannelAdapter, createTestEvent } from "@frontal-labs/open-channel-testing";
import { describe, expect, it } from "vitest";

describe("@frontal-labs/open-channel-adapter", () => {
  it("records outbound events in memory", async () => {
    const adapter = createTestChannelAdapter();
    const event = createTestEvent({ eventType: "message.sent", text: "hello" });

    await adapter.send(event);

    expect(adapter.provider).toBe("test");
    expect(adapter.sent).toEqual([event]);
  });
});
