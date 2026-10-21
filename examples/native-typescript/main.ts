import { runOcpTextAgent } from "../_shared/typescript/ocp-bridge.js";

await runOcpTextAgent(
  "Native TypeScript Agent",
  async (text) => `Deterministic response to: ${text}`,
);
