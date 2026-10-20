import type { ActionDefinition } from "acp-sdk";

/** Provider-neutral MCP tool invocation input. */
export interface McpToolCallInput {
  arguments?: Record<string, unknown>;
  tool: string;
}

/** Minimal MCP result shape accepted by the ACP action bridge. */
export interface McpToolResult {
  content?: unknown[];
  isError?: boolean;
  structuredContent?: unknown;
}

/** Narrow MCP client port; the official MCP client can implement this shape. */
export interface McpToolClient {
  callTool: (input: McpToolCallInput, options?: { signal?: AbortSignal }) => Promise<McpToolResult>;
  close?: () => Promise<void> | void;
}

/** ACP action definitions bridged from MCP tools. */
export type McpActions = ActionDefinition<unknown, unknown>[];
