import { createHmac, timingSafeEqual } from "node:crypto";
import { ValidationError } from "@acp/core";

/** Verifies a provider HMAC signature using a constant-time comparison. */
export function verifyHmacSignature(
  body: string | Uint8Array,
  signature: string,
  secret: string,
  options: { prefix?: string; encoding?: "hex" | "base64" } = {},
): void {
  const prefix = options.prefix ?? "sha256=";
  const provided = signature.startsWith(prefix) ? signature.slice(prefix.length) : signature;
  const expected = createHmac("sha256", secret)
    .update(typeof body === "string" ? Buffer.from(body) : body)
    .digest(options.encoding ?? "hex");
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new ValidationError("Provider webhook signature is invalid", {
      stage: "validation",
    });
  }
}

/** Rejects webhook timestamps outside a bounded replay window. */
export function verifyReplayTimestamp(
  timestamp: string,
  now = Date.now(),
  maximumAgeMs = 5 * 60_000,
): void {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) {
    throw new ValidationError("Provider webhook timestamp is invalid", { stage: "validation" });
  }
  if (Math.abs(now - seconds * 1000) > maximumAgeMs) {
    throw new ValidationError("Provider webhook timestamp is outside the replay window", {
      stage: "validation",
    });
  }
}
