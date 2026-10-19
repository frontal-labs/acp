import asyncio
import os

from acp_demo import run_acp_text_agent
from llama_index.core.agent.workflow import FunctionAgent
from llama_index.llms.openai import OpenAI

agent = FunctionAgent(
    llm=OpenAI(model=os.getenv("OPENAI_MODEL", "gpt-4o-mini")),
    system_prompt="You are a concise assistant operating behind an ACP boundary.",
)


async def main() -> None:
    async def handle(text: str) -> str:
        result = await agent.run(text)
        return str(result)

    await run_acp_text_agent("LlamaIndex Agent", handle)


if __name__ == "__main__":
    asyncio.run(main())
