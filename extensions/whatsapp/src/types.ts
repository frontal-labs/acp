import type { ChannelDefinition } from "@frontal-labs/open-channel";
import type { ActorRef } from "@frontal-labs/open-channel-protocol";

/** Outbound WhatsApp text message accepted by a transport. */
export interface WhatsAppSendInput {
  idempotencyKey?: string;
  phoneNumberId: string;
  signal?: AbortSignal;
  text: string;
  to: string;
}

/** Narrow transport port for WhatsApp Business Cloud API delivery. */
export interface WhatsAppTransport {
  sendMessage: (input: WhatsAppSendInput) => Promise<{ messageId?: string }>;
}

/** Optional WhatsApp actor lookup and business number settings. */
export interface WhatsAppSourceOptions {
  actorResolver?: (phone: string) => ActorRef | Promise<ActorRef>;
  businessPhoneNumberId?: string;
  /** Agent that receives inbound messages. AgentHost routes only by `recipient`, so without it the message reaches no agent. */
  recipient?: ActorRef;
}

/** Complete WhatsApp channel configuration for `openChannel()`. */
export interface WhatsAppChannelOptions extends WhatsAppSourceOptions {
  phoneNumberId: string;
  transport: WhatsAppTransport;
}

/** A WhatsApp webhook request with its raw body and headers. */
export interface WhatsAppWebhookRequest {
  body: string | Uint8Array;
  headers: Record<string, string | undefined>;
}

/** OCP channel definition for WhatsApp. */
export type WhatsAppChannel = ChannelDefinition;
