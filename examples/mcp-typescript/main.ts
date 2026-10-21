import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { runOpenChannelTextAgent } from "../_shared/typescript/ocp-bridge.js";

const command = process.env.MCP_SERVER_COMMAND ?? "npx";
const args = process.env.MCP_SERVER_ARGS
  ? JSON.parse(process.env.MCP_SERVER_ARGS)
  : ["-y", "@modelcontextprotocol/server-everything"];
const toolName = process.env.MCP_TOOL_NAME ?? "echo";

await runOpenChannelTextAgent("MCP Tool Agent", async (text) => {
  const client = new Client({ name: "ocp-mcp-example", version: "0.1.0" });
  await client.connect(new StdioClientTransport({ args, command }));
  try {
    const result = await client.callTool({
      arguments: { message: text },
      name: toolName,
    });
    return result.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  } finally {
    await client.close();
  }
});
