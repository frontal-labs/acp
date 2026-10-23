import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";

/** Test-only RSA key pair and RS256 token signer. Never used outside tests. */
export function createTestSigner(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), alg: "RS256", kid, use: "sig" };

  function sign(
    claims: Record<string, unknown>,
    options: { alg?: string; kid?: string } = {},
  ): string {
    const header = { alg: options.alg ?? "RS256", kid: options.kid ?? kid, typ: "JWT" };
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const signingInput = `${encode(header)}.${encode(claims)}`;
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    return `${signingInput}.${signer.sign(privateKey).toString("base64url")}`;
  }

  return {
    jwk,
    pem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    publicKey: publicKey as KeyObject,
    sign,
  };
}
