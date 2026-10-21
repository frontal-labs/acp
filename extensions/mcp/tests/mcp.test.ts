import { describe, expect, it } from "vitest";
import { createMcpActions } from "../src/index.js";

describe("@frontal-labs/open-channel-ext-mcp", () => {
  it("creates a policy-controlled MCP action", async () => {
    const calls: string[] = [];
    const [action] = createMcpActions({
      callTool: ({ tool }) => {
        calls.push(tool);
        return Promise.resolve({ content: [{ text: "ok", type: "text" }] });
      },
    });
    expect(action?.type).toBe("mcp.tool_call");
    const result = await action?.execute(
      { tool: "echo" },
      { actor: {} as never, request: {} as never, runtime: {} as never },
    );
    expect(result).toMatchObject({ content: [{ text: "ok" }] });
    expect(calls).toEqual(["echo"]);
  });
});
