import type { ChannelDefinition } from "@frontal-labs/open-channel";
import type { ActorRef } from "@frontal-labs/open-channel-protocol";

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
  /**
   * Agent that receives inbound messages. AgentHost routes only by `recipient`, so without it
   * a Slack message reaches no agent.
   */
  recipient?: ActorRef;
}

/** Complete Slack channel configuration for `createOcp({ channels })`. */
export interface SlackChannelOptions extends SlackSourceOptions {
  transport: SlackTransport;
}

/** A verified Slack request suitable for the source normalizer. */
export interface SlackWebhookRequest {
  body: string | Uint8Array;
  headers: Record<string, string | undefined>;
}

/** Creates a config-first OCP channel definition for Slack. */
export type SlackChannel = ChannelDefinition;
