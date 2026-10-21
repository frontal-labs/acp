import { eventToJson } from "@frontal-labs/open-channel-protocol";
import { createBufferedTestIO, createTestEvent } from "@frontal-labs/open-channel-testing";
import { describe, expect, it } from "vitest";
import { runCommand } from "../src/index.js";

describe("@frontal-labs/open-channel-cli", () => {
  it("validates buffered ProtoJSON input", async () => {
    const { io, stdout } = createBufferedTestIO(
      JSON.stringify(eventToJson(createTestEvent({ eventType: "message.received" }))),
    );

    expect(await runCommand(["validate"], io)).toBe(0);
    expect(stdout[0]).toBe("valid OCP event: message.received");
  });
});
