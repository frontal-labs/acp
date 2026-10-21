import asyncio
import os

from agents import Agent, Runner
from ocp_demo import run_ocp_text_agent

agent = Agent(
    name="OpenAI OCP Agent",
    instructions="Answer briefly and explain safety boundaries when asked.",
    model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
)


async def main() -> None:
    async def handle(text: str) -> str:
        result = await Runner.run(agent, text)
        if result.interruptions:
            return (
                "The agent requested an interruption; OCP approval is required before continuing."
            )
        return str(result.final_output)

    await run_ocp_text_agent("OpenAI Agents Python", handle)


if __name__ == "__main__":
    asyncio.run(main())
