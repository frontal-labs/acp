import type { ActorRef } from "@acp/protocol";
import type { ChannelDefinition } from "acp-sdk";

/** Outbound message accepted by a Slack transport implementation. */
export interface SlackSendInput {
  attachments: unknown[];
  channelId: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
  text: string;
  threadId?: string;
}

/** Narrow port implemented by a Slack Web API client. */
export interface SlackTransport {
  postMessage: (input: SlackSendInput) => Promise<{ messageId?: string }>;
}

/** Configuration for Slack actor lookup. */
export interface SlackSourceOptions {
  actorResolver?: (userId: string) => ActorRef | Promise<ActorRef>;
  botUserId?: string;
}

/** Complete Slack channel configuration for `createAcp({ channels })`. */
export interface SlackChannelOptions extends SlackSourceOptions {
  transport: SlackTransport;
}

/** A verified Slack request suitable for the source normalizer. */
export interface SlackWebhookRequest {
  body: string | Uint8Array;
  headers: Record<string, string | undefined>;
}

/** Creates a config-first ACP channel definition for Slack. */
export type SlackChannel = ChannelDefinition;
