import asyncio
import os

from acp_demo import run_acp_text_agent
from pydantic_ai import Agent

agent = Agent(
    os.getenv("ACP_MODEL", "openai:gpt-5.2"),
    system_prompt="You are a concise assistant operating behind an ACP boundary.",
)


async def main() -> None:
    async def handle(text: str) -> str:
        result = await agent.run(text)
        return str(result.output)

    await run_acp_text_agent("PydanticAI Agent", handle)


if __name__ == "__main__":
    asyncio.run(main())
