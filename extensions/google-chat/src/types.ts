import type { ActorRef } from "@acp/protocol";
import type { ChannelDefinition } from "acp-sdk";

/** Outbound Google Chat message accepted by a Chat API transport. */
export interface GoogleChatSendInput {
  attachments: unknown[];
  idempotencyKey?: string;
  signal?: AbortSignal;
  space: string;
  text: string;
  thread?: string;
}

/** Narrow transport port for Google Chat delivery. */
export interface GoogleChatTransport {
  createMessage: (input: GoogleChatSendInput) => Promise<{ messageId?: string }>;
}

/** Optional Google Chat actor lookup. */
export interface GoogleChatSourceOptions {
  actorResolver?: (id: string) => ActorRef | Promise<ActorRef>;
  appId?: string;
}

export interface GoogleChatChannelOptions extends GoogleChatSourceOptions {
  transport: GoogleChatTransport;
}

export interface GoogleChatWebhookRequest {
  headers: Record<string, string | undefined>;
}

export type GoogleChatChannel = ChannelDefinition;
