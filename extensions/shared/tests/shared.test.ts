import { createHmac } from "node:crypto";
import { createTestMessageReceived } from "@frontal-labs/open-channel-testing";
import { describe, expect, it } from "vitest";
import { providerActor, providerEvent, verifyHmacSignature } from "../src/index.js";

describe("@frontal-labs/open-channel-ext-shared", () => {
  it("creates a valid provider event with deterministic metadata", () => {
    const actor = providerActor("slack:user", "Slack User");
    const event = providerEvent(
      {
        actor,
        channelId: "C123",
        conversationId: "slack:C123",
        eventType: "message.received",
        extensions: { "ocp.provider": "slack" },
        payload: { case: "messageReceived", value: createTestMessageReceived("hello") },
      },
      { eventId: "provider-event", idempotencyKey: "provider-event" },
    );

    expect(event.eventId).toBe("provider-event");
    expect(event.channel?.provider).toBe("slack");
  });

  it("verifies HMAC signatures", () => {
    const body = "{}";
    const signature = createHmac("sha256", "secret").update(body).digest("hex");
    expect(() => verifyHmacSignature(body, signature, "secret")).not.toThrow();
    expect(() => verifyHmacSignature(body, "bad", "secret")).toThrow();
  });
});
