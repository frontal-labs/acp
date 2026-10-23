import type { ActionDefinition } from "../types.js";

/** Provider-neutral MCP tool invocation input. */
export interface McpToolCallInput {
  /** Arguments for the tool, validated as a plain object. Values are passed through unchecked. */
  arguments?: Record<string, unknown>;
  /** Name of the MCP tool to call on the server. Must be non-empty. */
  tool: string;
}

/** Minimal MCP result shape accepted by the OCP action bridge. */
export interface McpToolResult {
  /** Content blocks returned by the tool, such as text or image parts. */
  content?: unknown[];
  /** Set by the MCP server when the tool ran but reported a failure. Such results become errors. */
  isError?: boolean;
  /** Typed output when the tool declares an output schema. */
  structuredContent?: unknown;
}

/**
 * Narrow MCP client port; the official MCP client can implement this shape. Implementations
 * own the server connection and its credentials.
 */
export interface McpToolClient {
  /** Invokes a tool. `signal` is accepted by the port but the action bridge does not supply one. */
  callTool: (input: McpToolCallInput, options?: { signal?: AbortSignal }) => Promise<McpToolResult>;
  /** Releases the server connection. Optional; see `closeMcpClient`. */
  close?: () => Promise<void> | void;
}

/** OCP action definitions bridged from MCP tools. */
export type McpActions = ActionDefinition<unknown, unknown>[];
