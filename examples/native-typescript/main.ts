import { runOpenChannelTextAgent } from "../_shared/typescript/ocp-bridge.js";

await runOpenChannelTextAgent(
  "Native TypeScript Agent",
  async (text) => `Deterministic response to: ${text}`,
);
