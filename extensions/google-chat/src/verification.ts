import { ValidationError } from "@acp/core";

import type { GoogleChatWebhookRequest } from "./types.js";

/** Verifies a Google Chat webhook through a host-supplied token verifier. */
export async function verifyGoogleChatWebhook(
  request: GoogleChatWebhookRequest,
  verifyToken: (request: GoogleChatWebhookRequest) => boolean | Promise<boolean>,
): Promise<void> {
  if (!(await verifyToken(request))) {
    throw new ValidationError("Google Chat webhook authorization is invalid", {
      provider: "google-chat",
      stage: "validation",
    });
  }
}
