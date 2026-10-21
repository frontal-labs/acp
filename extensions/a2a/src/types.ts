import type { AgentCard, ChannelDefinition } from "@frontal-labs/open-channel";
import type { ActorRef } from "@frontal-labs/open-channel-protocol";

/** Outbound A2A message; `taskId` and `contextId` correlate follow-up turns. */
export interface A2ASendInput {
  contextId?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
  taskId?: string;
  text: string;
}

/** Narrow transport port for sending messages to a remote A2A agent. */
export interface A2ATransport {
  sendMessage: (input: A2ASendInput) => Promise<{ externalId?: string }>;
}

/** Optional local agent identity for inbound A2A messages. */
export interface A2ASourceOptions {
  localAgentId?: string;
  /** Agent that receives inbound messages. AgentHost routes only by `recipient`, so without it the message reaches no agent. */
  recipient?: ActorRef;
}

/** Complete A2A channel configuration for `openChannel()`. */
export interface A2AChannelOptions extends A2ASourceOptions {
  transport: A2ATransport;
}

/** Source of the A2A agent cards advertised to peers. */
export interface AgentCardRegistry {
  listAgentCards: () => AgentCard[];
}

/** OCP channel definition for A2A. */
export type A2AChannel = ChannelDefinition;
