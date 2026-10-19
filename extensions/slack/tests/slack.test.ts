import { createTestEvent } from "@acp/testing";
import { describe, expect, it } from "vitest";
import { createSlackSink, createSlackSource } from "../src/index.js";

describe("@acp/ext-slack", () => {
  it("normalizes a Slack message through the ChannelSource contract", async () => {
    const source = createSlackSource();
    const normalized = await source.normalize({
      event: { channel: "C123", text: "hello", ts: "123.456", type: "message", user: "U123" },
      event_id: "Ev123",
      type: "event_callback",
    });
    const event = Array.isArray(normalized) ? normalized[0] : normalized;

    expect(event?.eventType).toBe("message.received");
    expect(event?.channel?.provider).toBe("slack");
    expect(event?.payload.case).toBe("messageReceived");
  });

  it("sends message.sent through an injected Slack transport", async () => {
    const calls: string[] = [];
    const sink = createSlackSink({
      postMessage: ({ text }) => {
        calls.push(text);
        return Promise.resolve({ messageId: "ts:1" });
      },
    });
    const event = createTestEvent({ eventType: "message.sent", text: "hello" });
    await sink.send(event);
    expect(calls).toEqual(["hello"]);
  });
});
