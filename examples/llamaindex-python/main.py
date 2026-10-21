import asyncio
import os

from llama_index.core.agent.workflow import FunctionAgent
from llama_index.llms.openai import OpenAI
from ocp_demo import run_ocp_text_agent

agent = FunctionAgent(
    llm=OpenAI(model=os.getenv("OPENAI_MODEL", "gpt-4o-mini")),
    system_prompt="You are a concise assistant operating behind an OCP boundary.",
)


async def main() -> None:
    async def handle(text: str) -> str:
        result = await agent.run(text)
        return str(result)

    await run_ocp_text_agent("LlamaIndex Agent", handle)


if __name__ == "__main__":
    asyncio.run(main())
