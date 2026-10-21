import { ActionError } from "@frontal-labs/open-channel-core";
import type { ActionDefinition } from "openchannel";
import { action } from "openchannel";
import { z } from "zod";

import type { McpActions, McpToolCallInput, McpToolClient, McpToolResult } from "./types.js";

const McpToolCallSchema = z.object({
  arguments: z.record(z.string(), z.unknown()).optional(),
  tool: z.string().min(1),
});

/** Creates the policy-controlled MCP tool action used by OCP agents. */
export function createMcpActions(client: McpToolClient): McpActions {
  const mcpTool = action<McpToolCallInput, McpToolResult>({
    execute: async (input) => {
      try {
        const result = await client.callTool(input);
        if (result.isError) {
          throw new ActionError(`MCP tool ${input.tool} returned an error`, {
            provider: "mcp",
            retryable: false,
          });
        }
        return result;
      } catch (error) {
        if (error instanceof ActionError) {
          throw error;
        }
        throw new ActionError(`MCP tool ${input.tool} failed`, {
          cause: error,
          provider: "mcp",
          retryable: true,
        });
      }
    },
    type: "mcp.tool_call",
    validate: (input) => McpToolCallSchema.parse(input),
  });
  return [mcpTool] as McpActions;
}

/** Closes an MCP client when an SDK application stops. */
export async function closeMcpClient(client: McpToolClient): Promise<void> {
  await client.close?.();
}

/** Narrows an action bundle to a typed MCP action definition. */
export function mcpAction<TInput, TResult>(
  definition: ActionDefinition<TInput, TResult>,
): ActionDefinition<TInput, TResult> {
  return definition;
}
