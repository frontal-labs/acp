import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySlackWebhook } from "../../src/slack/index.js";

const signingSecret = "signing-secret";
const body = "{}";
const now = 1_700_000_000_000;
const timestamp = String(now / 1000);

function signatureFor(requestTimestamp: string, requestBody: string): string {
  return `v0=${createHmac("sha256", signingSecret).update(`v0:${requestTimestamp}:${requestBody}`).digest("hex")}`;
}

describe("verifySlackWebhook", () => {
  it("accepts a correctly signed request inside the replay window", () => {
    expect(() =>
      verifySlackWebhook(
        {
          body,
          headers: {
            "x-slack-request-timestamp": timestamp,
            "x-slack-signature": signatureFor(timestamp, body),
          },
        },
        signingSecret,
        now,
      ),
    ).not.toThrow();
  });

  it("rejects a signature computed with a different secret", () => {
    const signature = `v0=${createHmac("sha256", "other-secret").update(`v0:${timestamp}:${body}`).digest("hex")}`;
    expect(() =>
      verifySlackWebhook(
        {
          body,
          headers: { "x-slack-request-timestamp": timestamp, "x-slack-signature": signature },
        },
        signingSecret,
        now,
      ),
    ).toThrow("Slack webhook signature is invalid");
  });

  it("rejects a timestamp outside the five-minute replay window", () => {
    const staleTimestamp = String(now / 1000 - 6 * 60);
    expect(() =>
      verifySlackWebhook(
        {
          body,
          headers: {
            "x-slack-request-timestamp": staleTimestamp,
            "x-slack-signature": signatureFor(staleTimestamp, body),
          },
        },
        signingSecret,
        now,
      ),
    ).toThrow("outside the replay window");
  });
});
