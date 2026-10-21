import type { EventEnvelope } from "@frontal-labs/open-channel-protocol";
import { eventType } from "@frontal-labs/open-channel-protocol";
import { describe, expect, it } from "vitest";
import { createA2ASource } from "../src/index.js";

describe("@frontal-labs/open-channel-ext-a2a", () => {
  it("normalizes A2A parts and preserves task context", async () => {
    const source = createA2ASource();
    const event = await source.normalize({
      contextId: "context-1",
      message: { parts: [{ text: "hello" }], sender: { id: "remote" } },
      taskId: "task-1",
    });
    expect(
      (event as unknown as { extensions: Record<string, string> }).extensions["a2a.task_id"],
    ).toBe("task-1");
    expect(eventType(event as EventEnvelope)).toBe("message.received");
  });
});
