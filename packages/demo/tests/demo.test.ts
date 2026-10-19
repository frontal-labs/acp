import { afterEach, describe, expect, it, vi } from "vitest";

import { runDemo } from "../src/index.js";

describe("@acp/demo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the approval and execution reference flow", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runDemo();

    expect(log.mock.calls.some(([message]) => message === "action status: approval_required")).toBe(
      true,
    );
    expect(log.mock.calls.some(([message]) => String(message).startsWith("action executed:"))).toBe(
      true,
    );
  });
});
