import { ValidationError } from "@acp/core";
import { verifyHmacSignature, verifyReplayTimestamp } from "@acp/ext-shared";

import type { SlackWebhookRequest } from "./types.js";

/** Verifies Slack's signed request before passing its body to `app.receive()`. */
export function verifySlackWebhook(
  request: SlackWebhookRequest,
  signingSecret: string,
  now = Date.now(),
): void {
  const timestamp = request.headers["x-slack-request-timestamp"];
  const signature = request.headers["x-slack-signature"];
  if (!(timestamp && signature)) {
    throw new ValidationError("Slack webhook headers are incomplete", {
      provider: "slack",
      stage: "validation",
    });
  }
  verifyReplayTimestamp(timestamp, now);
  verifyHmacSignature(
    `v0:${timestamp}:${typeof request.body === "string" ? request.body : Buffer.from(request.body).toString("utf8")}`,
    signature,
    signingSecret,
    { prefix: "v0=" },
  );
}
