/**
 * LangChain TypeScript example: a LangChain v1 `createAgent` agent behind an OCP message boundary.
 *
 * OCP concept: LangChain owns model execution. OCP owns the inbound `message.received` envelope,
 * the agent routing, and the outbound `message.sent` reply. This file only builds the agent and
 * hands each message to `runOpenChannelTextAgent` from `./ocp-bridge.ts`.
 *
 * Run it:
 *   npm start --prefix examples/langchain-typescript                       (live OpenAI model)
 *   OCP_EXAMPLE_DETERMINISTIC=1 npm start --prefix examples/langchain-typescript  (no key, no network)
 */
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";

import { runOpenChannelTextAgent } from "./ocp-bridge.js";

/** Env var that switches to the scripted fake model. Set it to `"1"` to skip OpenAI entirely. */
const DETERMINISTIC_ENV = "OCP_EXAMPLE_DETERMINISTIC";

/** Env var read by `ChatOpenAI` in live mode. Its value is a secret; never commit it. */
const API_KEY_ENV = "OPENAI_API_KEY";

/** Optional env var that picks the OpenAI chat model for live mode. */
const MODEL_ENV = "OPENAI_MODEL";

/** Model used in live mode when `OPENAI_MODEL` is unset. */
const DEFAULT_MODEL = "gpt-4o-mini";

/** Question sent when the command line has no arguments. */
const DEFAULT_QUESTION = "Explain why OCP keeps policy outside the model prompt.";

/** System prompt for the agent. It describes the boundary; it does not grant any permissions. */
const SYSTEM_PROMPT = "You are a concise assistant operating behind an OCP message boundary.";

/** Scripted reply used by the fake model in deterministic mode. */
const DETERMINISTIC_REPLY =
  "Policy stays outside the prompt, so a model reply cannot grant permissions.";

const deterministic = process.env[DETERMINISTIC_ENV] === "1";

if (!(deterministic || process.env[API_KEY_ENV])) {
  throw new Error(
    [
      `${API_KEY_ENV} is not set, so the live OpenAI model cannot start.`,
      "Create a key at https://platform.openai.com/api-keys, then run:",
      `  export ${API_KEY_ENV}=...`,
      `Or run without a key: ${DETERMINISTIC_ENV}=1 npm start --prefix examples/langchain-typescript`,
    ].join("\n"),
  );
}

// Deterministic mode swaps only the model. createAgent and the OCP path still run unchanged.
const model = deterministic
  ? new FakeListChatModel({ responses: [DETERMINISTIC_REPLY] })
  : new ChatOpenAI({ model: process.env[MODEL_ENV] ?? DEFAULT_MODEL });

const agent = createAgent({
  model,
  systemPrompt: SYSTEM_PROMPT,
});

await runOpenChannelTextAgent({
  handler: async (text) => {
    const result = await agent.invoke({ messages: [{ content: text, role: "user" }] });
    const content = result.messages.at(-1)?.content;
    // Non-string content (for example, an array of content blocks) is serialized as JSON.
    return typeof content === "string" ? content : JSON.stringify(content);
  },
  input: process.argv.slice(2).join(" ") || DEFAULT_QUESTION,
  name: "LangChain TypeScript Agent",
});
