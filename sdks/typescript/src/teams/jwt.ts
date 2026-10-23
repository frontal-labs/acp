import { createPublicKey, createVerify, type KeyObject } from "node:crypto";

/** Claims a Bot Framework token must satisfy before a Teams request is accepted. */
export interface JwtVerificationOptions {
  /** Accepted audience values. The token must name at least one of them. */
  audience: string | string[];
  /** Clock skew tolerated for `exp` and `nbf`, in seconds. */
  clockToleranceSeconds?: number;
  /** Accepted issuers. The token's `iss` must match one of them exactly. */
  issuer: string | string[];
  /** Resolves the public key for a key ID, or undefined when the key is unknown. */
  keyFor: (kid: string) => Promise<KeyObject | undefined> | KeyObject | undefined;
  /** Current time in milliseconds. Injected by tests. */
  now?: number;
}

/** Thrown for any token that is malformed, unsigned, expired, or for another issuer or audience. */
export class InvalidTokenError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "InvalidTokenError";
  }
}

function decodeSegment(segment: string): Record<string, unknown> {
  const value: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidTokenError("JWT segment is not a JSON object");
  }
  return value as Record<string, unknown>;
}

function toList(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * Verifies an RS256 JWT and returns its claims. Only RS256 is accepted, so `alg: none` and
 * algorithm-confusion attacks are rejected before any key is used.
 */
export async function verifyRs256Jwt(
  token: string,
  options: JwtVerificationOptions,
): Promise<Record<string, unknown>> {
  const segments = token.split(".");
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    throw new InvalidTokenError("JWT must have three non-empty segments");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = segments as [string, string, string];

  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = decodeSegment(encodedHeader);
    claims = decodeSegment(encodedPayload);
  } catch (error) {
    throw new InvalidTokenError(
      `JWT is not valid base64url JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (header.alg !== "RS256") {
    throw new InvalidTokenError("JWT algorithm must be RS256");
  }
  if (typeof header.kid !== "string" || header.kid.length === 0) {
    throw new InvalidTokenError("JWT header must name a key ID");
  }

  const key = await options.keyFor(header.kid);
  if (!key) {
    throw new InvalidTokenError("JWT key ID is not trusted");
  }
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();
  if (!verifier.verify(key, Buffer.from(encodedSignature, "base64url"))) {
    throw new InvalidTokenError("JWT signature is invalid");
  }

  const issuers = toList(options.issuer);
  if (typeof claims.iss !== "string" || !issuers.includes(claims.iss)) {
    throw new InvalidTokenError("JWT issuer is not accepted");
  }
  const audiences = toList(options.audience);
  const tokenAudiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    !tokenAudiences.some((audience) => typeof audience === "string" && audiences.includes(audience))
  ) {
    throw new InvalidTokenError("JWT audience is not accepted");
  }

  const nowSeconds = (options.now ?? Date.now()) / 1000;
  const tolerance = options.clockToleranceSeconds ?? 60;
  if (typeof claims.exp !== "number" || nowSeconds > claims.exp + tolerance) {
    throw new InvalidTokenError("JWT has expired");
  }
  if (typeof claims.nbf === "number" && nowSeconds + tolerance < claims.nbf) {
    throw new InvalidTokenError("JWT is not yet valid");
  }
  return claims;
}

/**
 * Caches a provider's signing keys by key ID. Keys are refetched when the cache is older than
 * `ttlMs`, or when a token names a key ID that is not cached. Fetches are spaced at least
 * `minRefreshIntervalMs` apart, counting failed attempts, so a stream of bad tokens cannot force
 * a fetch per request. Concurrent callers share one in-flight fetch. A failed refresh rejects
 * the lookup that triggered it and keeps the previously cached keys.
 */
export function createKeyCache(
  fetchKeys: () => Promise<Record<string, KeyObject>>,
  options: { ttlMs?: number; minRefreshIntervalMs?: number; now?: () => number } = {},
): (kid: string) => Promise<KeyObject | undefined> {
  const ttlMs = options.ttlMs ?? 60 * 60_000;
  const minRefreshIntervalMs = options.minRefreshIntervalMs ?? 60_000;
  const now = options.now ?? Date.now;
  let keys: Record<string, KeyObject> = {};
  let loadedAt = Number.NEGATIVE_INFINITY;
  let lastAttemptAt = Number.NEGATIVE_INFINITY;
  let inFlight: Promise<void> | undefined;

  const refresh = (): Promise<void> => {
    lastAttemptAt = now();
    inFlight = fetchKeys()
      .then((fresh) => {
        keys = fresh;
        loadedAt = now();
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };

  return async (kid) => {
    if (inFlight) {
      await inFlight;
    } else {
      const current = now();
      const stale = current - loadedAt > ttlMs;
      const unknown = !Object.hasOwn(keys, kid);
      if ((stale || unknown) && current - lastAttemptAt > minRefreshIntervalMs) {
        await refresh();
      }
    }
    // Own-property check: a key ID such as "constructor" must not resolve to Object.prototype.
    return Object.hasOwn(keys, kid) ? keys[kid] : undefined;
  };
}

/** Parses a Bot Framework JWK set (`{ keys: [...] }`) into RSA public keys indexed by key ID. */
export function publicKeysFromJwks(jwks: unknown): Record<string, KeyObject> {
  const entries = (jwks as { keys?: unknown }).keys;
  if (!Array.isArray(entries)) {
    throw new InvalidTokenError("JWK set has no keys array");
  }
  const result: Record<string, KeyObject> = {};
  for (const entry of entries) {
    const jwk = entry as { kid?: unknown; kty?: unknown };
    if (typeof jwk.kid === "string" && jwk.kty === "RSA") {
      result[jwk.kid] = createPublicKey({ format: "jwk", key: entry as never });
    }
  }
  return result;
}
