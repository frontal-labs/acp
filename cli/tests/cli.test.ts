import { eventToJson } from "@acp/protocol";
import { createBufferedTestIO, createTestEvent } from "@acp/testing";
import { describe, expect, it } from "vitest";
import { runCommand } from "../src/index.js";

describe("acp-cli", () => {
  it("validates buffered ProtoJSON input", async () => {
    const { io, stdout } = createBufferedTestIO(
      JSON.stringify(eventToJson(createTestEvent({ eventType: "message.received" }))),
    );

    expect(await runCommand(["validate"], io)).toBe(0);
    expect(stdout[0]).toBe("valid ACP event: message.received");
  });
});
