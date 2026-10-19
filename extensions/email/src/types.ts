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

export interface EmailTransport {
  sendEmail: (input: EmailSendInput) => Promise<{ messageId?: string }>;
}

export interface EmailPoller {
  poll: (signal: AbortSignal) => AsyncIterable<EmailMessage>;
  stop?: () => Promise<void> | void;
}

export interface EmailSourceOptions {
  actorResolver?: (address: string) => ActorRef | Promise<ActorRef>;
  mailbox: string;
  poller?: EmailPoller;
}

export interface EmailChannelOptions extends EmailSourceOptions {
  transport: EmailTransport;
}

export type EmailChannel = ChannelDefinition;
