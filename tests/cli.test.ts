import { eventToJson } from "@acp/protocol";
import { createBufferedTestIO, createTestEvent } from "@acp/testing";
import { runCommand } from "acp-cli";
import { describe, expect, it } from "vitest";

const INVALID_EVENT_PATTERN = /^invalid ACP event:/;

describe("ACP CLI", () => {
  it("reports the protocol version", async () => {
    const { io, stdout } = createBufferedTestIO();

    const code = await runCommand(["version"], io);

    expect(code).toBe(0);
    expect(stdout).toEqual(["0.1"]);
  });

  it("validates ProtoJSON read from stdin", async () => {
    const { io, stdout } = createBufferedTestIO(
      JSON.stringify(eventToJson(createTestEvent({ text: "hello" }))),
    );

    const code = await runCommand(["validate"], io);

    expect(code).toBe(0);
    expect(stdout).toEqual(["valid ACP event: message.received"]);
  });

  it("returns a useful error for invalid input", async () => {
    const { io, stderr } = createBufferedTestIO("{not-json}");

    const code = await runCommand(["validate"], io);

    expect(code).toBe(1);
    expect(stderr[0]).toMatch(INVALID_EVENT_PATTERN);
  });
});
