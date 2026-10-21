import { create } from "@bufbuild/protobuf";
import { ActorRefSchema, ActorType } from "@frontal-labs/open-channel-protocol";
import { describe, expect, it } from "vitest";
import { createEmailSource } from "../src/index.js";

describe("@frontal-labs/open-channel-ext-email routing", () => {
  it("sets the configured recipient so AgentHost can route the message", async () => {
    const route = create(ActorRefSchema, { id: "agent:email-helper", type: ActorType.AGENT });
    const source = createEmailSource({ mailbox: "agent@example.com", recipient: route });
    const normalized = await source.normalize({
      from: "person@example.com",
      id: "<message@example.com>",
      subject: "Question",
      text: "hello",
      to: ["agent@example.com"],
    });
    const event = Array.isArray(normalized) ? normalized[0] : normalized;

    expect(event?.recipient?.id).toBe("agent:email-helper");
  });
});
