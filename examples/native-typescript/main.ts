import { runAcpTextAgent } from "../_shared/typescript/acp-bridge.js";

await runAcpTextAgent(
  "Native TypeScript Agent",
  async (text) => `Deterministic response to: ${text}`,
);
