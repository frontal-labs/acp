import asyncio

from ocp_demo import run_ocp_text_agent


async def main() -> None:
    await run_ocp_text_agent(
        "Native Python Agent",
        lambda text: f"Deterministic response to: {text}",
    )


if __name__ == "__main__":
    asyncio.run(main())
