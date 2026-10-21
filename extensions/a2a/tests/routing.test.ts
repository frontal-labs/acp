import { ActorRefSchema, ActorType } from "@acp/protocol";
import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { createA2ASource } from "../src/index.js";

describe("@acp/ext-a2a routing", () => {
  it("sets the configured recipient so AgentHost can route the message", async () => {
    const route = create(ActorRefSchema, { id: "agent:a2a-helper", type: ActorType.AGENT });
    const source = createA2ASource({ recipient: route });
    const normalized = await source.normalize({
      contextId: "context-1",
      message: { parts: [{ text: "hello" }], sender: { id: "remote" } },
      taskId: "task-1",
    });
    const event = Array.isArray(normalized) ? normalized[0] : normalized;

    expect(event?.recipient?.id).toBe("agent:a2a-helper");
  });
});
