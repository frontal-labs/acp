import type { ActorRef } from "@acp/protocol";
import type { ChannelDefinition } from "acp-sdk";

/** Provider-neutral email message used by SMTP, IMAP, or webhook transports. */
export interface EmailMessage {
  attachments?: unknown[];
  cc?: string[];
  from: string;
  html?: string;
  id?: string;
  inReplyTo?: string;
  references?: string[];
  subject?: string;
  text: string;
  threadId?: string;
  to: string[];
}

/** Outbound email accepted by a transport implementation. */
export interface EmailSendInput extends EmailMessage {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/** Narrow transport port for outbound email delivery. */
export interface EmailTransport {
  sendEmail: (input: EmailSendInput) => Promise<{ messageId?: string }>;
}

/** Inbound email source that yields messages until the signal aborts; `stop` releases resources. */
export interface EmailPoller {
  poll: (signal: AbortSignal) => AsyncIterable<EmailMessage>;
  stop?: () => Promise<void> | void;
}

/** Inbound mailbox settings shared by email sources and channels. */
export interface EmailSourceOptions {
  actorResolver?: (address: string) => ActorRef | Promise<ActorRef>;
  mailbox: string;
  poller?: EmailPoller;
  /** Agent that receives inbound messages. AgentHost routes only by `recipient`, so without it the message reaches no agent. */
  recipient?: ActorRef;
}

/** Complete email channel configuration for `createAcp()`. */
export interface EmailChannelOptions extends EmailSourceOptions {
  transport: EmailTransport;
}

/** ACP channel definition for email. */
export type EmailChannel = ChannelDefinition;
