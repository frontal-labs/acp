import asyncio

from acp_demo import run_acp_text_agent


async def main() -> None:
    await run_acp_text_agent(
        "Native Python Agent",
        lambda text: f"Deterministic response to: {text}",
    )


if __name__ == "__main__":
    asyncio.run(main())
