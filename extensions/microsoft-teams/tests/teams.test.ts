import { describe, expect, it } from "vitest";
import { createTeamsSource } from "../src/index.js";

describe("@acp/ext-microsoft-teams", () => {
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
    expect((event as { eventType: string }).eventType).toBe("message.received");
  });
});
