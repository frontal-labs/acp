import { ValidationError } from "@acp/core";
import { verifyHmacSignature } from "@acp/ext-shared";

import type { WhatsAppWebhookRequest } from "./types.js";

/** Verifies the WhatsApp Business Cloud webhook signature. */
export function verifyWhatsAppWebhook(request: WhatsAppWebhookRequest, appSecret: string): void {
  const signature = request.headers["x-hub-signature-256"];
  if (!signature) {
    throw new ValidationError("WhatsApp webhook signature is missing", {
      provider: "whatsapp",
      stage: "validation",
    });
  }
  verifyHmacSignature(request.body, signature, appSecret);
}

/** Validates the GET challenge used when registering a WhatsApp webhook. */
export function verifyWhatsAppChallenge(
  mode: string | undefined,
  token: string | undefined,
  challenge: string | undefined,
  expectedToken: string,
): string {
  if (mode !== "subscribe" || token !== expectedToken || !challenge) {
    throw new ValidationError("WhatsApp webhook challenge is invalid", {
      provider: "whatsapp",
      stage: "validation",
    });
  }
  return challenge;
}
