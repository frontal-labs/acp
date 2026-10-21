import { timingSafeEqual } from "node:crypto";

import { ValidationError } from "@frontal-labs/open-channel-core";
import { verifyHmacSignature } from "@frontal-labs/open-channel-ext-shared";

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
  if (mode !== "subscribe" || !(challenge && constantTimeEqual(token, expectedToken))) {
    throw new ValidationError("WhatsApp webhook challenge is invalid", {
      provider: "whatsapp",
      stage: "validation",
    });
  }
  return challenge;
}

/** Compares secrets in constant time; unequal lengths and missing values are never equal. */
function constantTimeEqual(provided: string | undefined, expected: string): boolean {
  if (provided === undefined) {
    return false;
  }
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
