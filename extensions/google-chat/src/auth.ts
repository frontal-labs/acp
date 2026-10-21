import {
  createKeyCache,
  publicKeysFromPem,
  verifyRs256Jwt,
} from "@frontal-labs/open-channel-ext-shared";

import type { GoogleChatWebhookRequest } from "./types.js";

/** Issuer Google Chat uses for the bearer tokens it sends to an app's endpoint. */
export const GOOGLE_CHAT_ISSUER = "chat@system.gserviceaccount.com";
/** X.509 certificates, keyed by key ID, that sign Google Chat tokens. */
export const GOOGLE_CHAT_CERTS_URL = `https://www.googleapis.com/service_accounts/v1/metadata/x509/${GOOGLE_CHAT_ISSUER}`;

export interface GoogleChatTokenVerifierOptions {
  /** Overrides the certificate fetch. Used by tests and by hosts that pin keys. */
  fetchCerts?: () => Promise<Record<string, string>>;
  /** Current time in milliseconds. Injected by tests. */
  now?: () => number;
  /** Google Cloud project number. Tokens must name it as their audience. */
  projectNumber: string;
}

async function fetchCerts(): Promise<Record<string, string>> {
  const response = await fetch(GOOGLE_CHAT_CERTS_URL);
  if (!response.ok) {
    throw new Error(`Google Chat certificate fetch failed with ${response.status}`);
  }
  return (await response.json()) as Record<string, string>;
}

/**
 * Reference verifier for Google Chat bearer tokens. Pass the result to
 * `verifyGoogleChatWebhook` as its `verifyToken` argument. It reads the `Authorization: Bearer`
 * header and checks the RS256 signature, the Chat issuer, the project-number audience, and
 * expiry. Any failure returns false.
 */
export function createGoogleChatTokenVerifier(
  options: GoogleChatTokenVerifierOptions,
): (request: GoogleChatWebhookRequest) => Promise<boolean> {
  const loadCerts = options.fetchCerts ?? fetchCerts;
  const keyFor = createKeyCache(async () => publicKeysFromPem(await loadCerts()), {
    now: options.now,
  });
  return async (request) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) {
      return false;
    }
    try {
      await verifyRs256Jwt(token, {
        audience: options.projectNumber,
        issuer: GOOGLE_CHAT_ISSUER,
        keyFor,
        now: options.now?.(),
      });
      return true;
    } catch {
      return false;
    }
  };
}
