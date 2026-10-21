import { describe, expect, it } from "vitest";
import { createOpenTelemetryHooks } from "../src/index.js";

describe("@frontal-labs/open-channel-ext-opentelemetry", () => {
  it("creates hooks compatible with OcpApp", async () => {
    const spans: string[] = [];
    const hooks = createOpenTelemetryHooks({
      tracer: { startActiveSpan: (name, callback) => callback({ end: () => spans.push(name) }) },
    });
    await hooks.onEventAccepted?.({
      eventId: "1",
      eventType: "message.received",
      protocolVersion: "0.1",
    } as never);
    expect(spans).toEqual(["ocp.event.accepted"]);
  });
});
