import { messageReceived } from "openchannel";
import { describe, expect, it } from "vitest";
import { createOpenTelemetryHooks } from "../src/index.js";

describe("@frontal-labs/open-channel-ext-opentelemetry", () => {
  it("creates hooks compatible with OpenChannel", async () => {
    const spans: string[] = [];
    const hooks = createOpenTelemetryHooks({
      tracer: { startActiveSpan: (name, callback) => callback({ end: () => spans.push(name) }) },
    });
    await hooks.onEventAccepted?.(messageReceived({ eventId: "1", text: "hi" }));
    expect(spans).toEqual(["ocp.event.accepted"]);
  });
});
