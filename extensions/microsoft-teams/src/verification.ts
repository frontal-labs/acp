import { ValidationError } from "@acp/core";

import type { TeamsWebhookRequest } from "./types.js";

/** Verifies a Teams bearer token through a host-supplied verifier. */
export async function verifyTeamsWebhook(
  request: TeamsWebhookRequest,
  verifyToken: (token: string) => boolean | Promise<boolean>,
): Promise<void> {
  const { authorization } = request.headers;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!(token && (await verifyToken(token)))) {
    throw new ValidationError("Microsoft Teams webhook authorization is invalid", {
      provider: "microsoft-teams",
      stage: "validation",
    });
  }
}
