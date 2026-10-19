import asyncio

from acp_demo import run_acp_text_agent
from crewai import Agent, Crew, Task

worker = Agent(
    role="ACP response agent",
    goal="Answer one incoming ACP message clearly and safely",
    backstory="You work behind a provider-neutral protocol boundary.",
    verbose=False,
)
task = Task(
    description="Answer the incoming ACP message: {message}",
    expected_output="A concise text answer.",
    agent=worker,
)
crew = Crew(agents=[worker], tasks=[task], verbose=False)


async def main() -> None:
    async def handle(text: str) -> str:
        result = await crew.akickoff(inputs={"message": text})
        return str(getattr(result, "raw", result))

    await run_acp_text_agent("CrewAI Agent", handle)


if __name__ == "__main__":
    asyncio.run(main())
