import { createKeyCache, publicKeysFromJwks, verifyRs256Jwt } from "./jwt.js";

/** Bot Framework issuer for tokens that Microsoft Teams sends to a bot's messaging endpoint. */
export const BOT_FRAMEWORK_ISSUER = "https://api.botframework.com";
/** Public signing keys for Bot Framework tokens. */
export const BOT_FRAMEWORK_JWKS_URL = "https://login.botframework.com/v1/.well-known/keys";

/** Configuration for `teamsTokenVerifier`. */
export interface TeamsTokenVerifierOptions {
  /** Microsoft app ID the bot is registered under. Tokens must name it as their audience. */
  appId: string;
  /**
   * Overrides the JWKS fetch. Must resolve to a JWK set (`{ keys: [...] }`). Used by tests and by
   * hosts that pin keys.
   */
  fetchJwks?: () => Promise<unknown>;
  /** Current time in milliseconds. Injected by tests. */
  now?: () => number;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Bot Framework key fetch failed with ${response.status}`);
  }
  return response.json();
}

/**
 * Reference verifier for Microsoft Teams bearer tokens. Pass the result to
 * `verifyTeamsWebhook` as its `verifyToken` argument. It checks the RS256 signature, the Bot
 * Framework issuer, the app-ID audience, and expiry. Any failure returns false.
 */
export function teamsTokenVerifier(
  options: TeamsTokenVerifierOptions,
): (token: string) => Promise<boolean> {
  const fetchJwks = options.fetchJwks ?? (() => fetchJson(BOT_FRAMEWORK_JWKS_URL));
  const keyFor = createKeyCache(async () => publicKeysFromJwks(await fetchJwks()), {
    now: options.now,
  });
  return async (token) => {
    try {
      await verifyRs256Jwt(token, {
        audience: options.appId,
        issuer: BOT_FRAMEWORK_ISSUER,
        keyFor,
        now: options.now?.(),
      });
      return true;
    } catch {
      return false;
    }
  };
}
