import type { ActorRef } from "@frontal-labs/open-channel-protocol";
import type { ChannelDefinition } from "openchannel";

/** Outbound Teams message accepted by a Bot Framework or Graph transport. */
export interface TeamsSendInput {
  attachments: unknown[];
  conversationId: string;
  idempotencyKey?: string;
  replyToId?: string;
  signal?: AbortSignal;
  text: string;
}

/** Narrow transport port for Microsoft Teams delivery. */
export interface TeamsTransport {
  sendMessage: (input: TeamsSendInput) => Promise<{ messageId?: string }>;
}

/** Optional actor lookup for Teams directory identities. */
export interface TeamsSourceOptions {
  actorResolver?: (id: string) => ActorRef | Promise<ActorRef>;
  botId?: string;
  /** Agent that receives inbound messages. AgentHost routes only by `recipient`, so without it the message reaches no agent. */
  recipient?: ActorRef;
}

/** Complete Teams channel configuration for `openChannel()`. */
export interface TeamsChannelOptions extends TeamsSourceOptions {
  transport: TeamsTransport;
}

/** A verified Teams webhook request. */
export interface TeamsWebhookRequest {
  headers: Record<string, string | undefined>;
}

/** OCP channel definition for Microsoft Teams. */
export type TeamsChannel = ChannelDefinition;
