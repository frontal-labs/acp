import { ActorRefSchema, ActorType } from "@acp/protocol";
import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { createGoogleChatSource } from "../src/index.js";

describe("@acp/ext-google-chat routing", () => {
  it("sets the configured recipient so AgentHost can route the message", async () => {
    const route = create(ActorRefSchema, { id: "agent:google-chat-helper", type: ActorType.AGENT });
    const source = createGoogleChatSource({ recipient: route });
    const normalized = await source.normalize({
      eventTime: "2026-10-19T14:00:00Z",
      message: {
        name: "spaces/1/messages/1",
        sender: { displayName: "Alex", name: "users/1" },
        text: "hello",
        thread: { name: "spaces/1/threads/1" },
      },
      space: { name: "spaces/1" },
      type: "MESSAGE",
    });
    const event = Array.isArray(normalized) ? normalized[0] : normalized;

    expect(event?.recipient?.id).toBe("agent:google-chat-helper");
  });
});
