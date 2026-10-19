import type { ActorRef } from "@acp/protocol";
import type { ChannelDefinition } from "acp-sdk";

export interface WhatsAppSendInput {
  idempotencyKey?: string;
  phoneNumberId: string;
  signal?: AbortSignal;
  text: string;
  to: string;
}

export interface WhatsAppTransport {
  sendMessage: (input: WhatsAppSendInput) => Promise<{ messageId?: string }>;
}

export interface WhatsAppSourceOptions {
  actorResolver?: (phone: string) => ActorRef | Promise<ActorRef>;
  businessPhoneNumberId?: string;
}

export interface WhatsAppChannelOptions extends WhatsAppSourceOptions {
  phoneNumberId: string;
  transport: WhatsAppTransport;
}

export interface WhatsAppWebhookRequest {
  body: string | Uint8Array;
  headers: Record<string, string | undefined>;
}

export type WhatsAppChannel = ChannelDefinition;
