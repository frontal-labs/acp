import type { EventEnvelope } from "@frontal-labs/open-channel-protocol";
import { eventType } from "@frontal-labs/open-channel-protocol";
import { describe, expect, it } from "vitest";
import { createTeamsSource } from "../src/index.js";

describe("@frontal-labs/open-channel-ext-microsoft-teams", () => {
  it("normalizes a Teams message", async () => {
    const source = createTeamsSource();
    const event = await source.normalize({
      conversation: { id: "conversation-1" },
      from: { user: { displayName: "Alex", id: "user-1" } },
      id: "message-1",
      text: "hello",
      type: "message",
    });
    expect(Array.isArray(event)).toBe(false);
    expect(eventType(event as EventEnvelope)).toBe("message.received");
  });
});
