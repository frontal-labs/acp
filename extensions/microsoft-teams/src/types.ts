import type { ActorRef } from "@acp/protocol";
import type { ChannelDefinition } from "acp-sdk";

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
}

/** Complete Teams channel configuration for `createAcp()`. */
export interface TeamsChannelOptions extends TeamsSourceOptions {
  transport: TeamsTransport;
}

/** A verified Teams webhook request. */
export interface TeamsWebhookRequest {
  headers: Record<string, string | undefined>;
}

export type TeamsChannel = ChannelDefinition;
