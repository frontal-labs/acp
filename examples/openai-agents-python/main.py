import asyncio
import os

from acp_demo import run_acp_text_agent
from agents import Agent, Runner

agent = Agent(
    name="OpenAI ACP Agent",
    instructions="Answer briefly and explain safety boundaries when asked.",
    model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
)


async def main() -> None:
    async def handle(text: str) -> str:
        result = await Runner.run(agent, text)
        if result.interruptions:
            return (
                "The agent requested an interruption; ACP approval is required before continuing."
            )
        return str(result.final_output)

    await run_acp_text_agent("OpenAI Agents Python", handle)


if __name__ == "__main__":
    asyncio.run(main())
