import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

import { runOcpTextAgent } from "../_shared/typescript/ocp-bridge.js";

await runOcpTextAgent("Vercel AI SDK Agent", async (text) => {
  const result = await generateText({
    model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
    prompt: text,
  });
  return result.text;
});
