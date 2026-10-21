import asyncio
import os

from ocp_demo import run_ocp_text_agent
from pydantic_ai import Agent

agent = Agent(
    os.getenv("OCP_MODEL", "openai:gpt-5.2"),
    system_prompt="You are a concise assistant operating behind an OCP boundary.",
)


async def main() -> None:
    async def handle(text: str) -> str:
        result = await agent.run(text)
        return str(result.output)

    await run_ocp_text_agent("PydanticAI Agent", handle)


if __name__ == "__main__":
    asyncio.run(main())
