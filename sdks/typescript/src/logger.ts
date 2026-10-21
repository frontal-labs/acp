import type { AgentLogger } from "./types.js";

/** Default logger: warnings and errors go to the console; debug and info are silent. */
export const consoleLogger: AgentLogger = {
  debug: () => undefined,
  error: (message, details) => console.error(message, details ?? {}),
  info: () => undefined,
  warn: (message, details) => console.warn(message, details ?? {}),
};
