import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";

import { runAcpTextAgent } from "../_shared/typescript/acp-bridge.js";

const agent = createAgent({
  model: new ChatOpenAI({ model: process.env.OPENAI_MODEL ?? "gpt-4o-mini" }),
  systemPrompt: "You are a concise assistant operating behind an ACP message boundary.",
});

await runAcpTextAgent("LangChain TypeScript Agent", async (text) => {
  const result = await agent.invoke({ messages: [{ content: text, role: "user" }] });
  const content = result.messages.at(-1)?.content;
  return typeof content === "string" ? content : JSON.stringify(content);
});
