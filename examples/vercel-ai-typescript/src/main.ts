/**
 * Vercel AI SDK example: AI SDK Core's `generateText` behind an OCP message boundary.
 *
 * OCP concept: the AI SDK owns model execution. OCP owns the inbound `message.received` envelope,
 * agent routing, and the outbound `message.sent` reply. This file builds the one model call and
 * hands it to `runOpenChannelTextAgent` from `./ocp-bridge.ts`.
 *
 * This is a live example. It needs OPENAI_API_KEY and has no deterministic mode, because a scripted
 * model would skip the `generateText` call this example exists to show.
 *
 * Run it:
 *   npm start --prefix examples/vercel-ai-typescript
 */
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

import { runOpenChannelTextAgent } from "./ocp-bridge.js";

/** Env var read by `@ai-sdk/openai`. Its value is a secret; never commit it. */
const API_KEY_ENV = "OPENAI_API_KEY";

/** Optional env var that picks the OpenAI chat model. */
const MODEL_ENV = "OPENAI_MODEL";

/** Model used when `OPENAI_MODEL` is unset. */
const DEFAULT_MODEL = "gpt-4o-mini";

/** Question sent when the command line has no arguments. */
const DEFAULT_QUESTION = "Explain why OCP keeps policy outside the model prompt.";

if (!process.env[API_KEY_ENV]) {
  throw new Error(
    [
      `${API_KEY_ENV} is not set. This example calls OpenAI live and has no offline mode.`,
      "Create a key at https://platform.openai.com/api-keys, then run:",
      `  export ${API_KEY_ENV}=...`,
    ].join("\n"),
  );
}

const modelId = process.env[MODEL_ENV] ?? DEFAULT_MODEL;

await runOpenChannelTextAgent({
  handler: async (text) => {
    // `prompt` sends the inbound text as a single user message with no system prompt.
    const result = await generateText({
      model: openai(modelId),
      prompt: text,
    });
    return result.text;
  },
  input: process.argv.slice(2).join(" ") || DEFAULT_QUESTION,
  name: "Vercel AI SDK Agent",
});
