import type { AgentCard, ChannelDefinition } from "acp-sdk";

export interface A2ASendInput {
  contextId?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
  taskId?: string;
  text: string;
}

export interface A2ATransport {
  sendMessage: (input: A2ASendInput) => Promise<{ externalId?: string }>;
}

export interface A2ASourceOptions {
  localAgentId?: string;
}

export interface A2AChannelOptions extends A2ASourceOptions {
  transport: A2ATransport;
}

export interface AgentCardRegistry {
  listAgentCards: () => AgentCard[];
}

export type A2AChannel = ChannelDefinition;
