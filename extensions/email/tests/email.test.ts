import { describe, expect, it } from "vitest";
import { createEmailSource } from "../src/index.js";

describe("@acp/ext-email", () => {
  it("normalizes an email and preserves threading metadata", async () => {
    const source = createEmailSource({ mailbox: "agent@example.com" });
    const event = await source.normalize({
      from: "person@example.com",
      id: "<message@example.com>",
      inReplyTo: "<root@example.com>",
      subject: "Question",
      text: "hello",
      to: ["agent@example.com"],
    });
    expect((event as { channel?: { provider: string; threadId: string } }).channel).toMatchObject({
      provider: "email",
      threadId: "<root@example.com>",
    });
  });
});
