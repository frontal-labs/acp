import asyncio
import os
from typing import Any

from acp_demo import run_acp_text_agent
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

model = ChatOpenAI(model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
agent = create_agent(
    model=model,
    system_prompt="You are a concise assistant operating behind an ACP message boundary.",
)


def response_text(value: Any) -> str:
    content = value["messages"][-1].content
    if isinstance(content, str):
        return content
    return "".join(
        block.get("text", str(block)) if isinstance(block, dict) else str(block)
        for block in content
    )


async def main() -> None:
    async def handle(text: str) -> str:
        result = await agent.ainvoke({"messages": [{"role": "user", "content": text}]})
        return response_text(result)

    await run_acp_text_agent("LangChain Python Agent", handle)


if __name__ == "__main__":
    asyncio.run(main())
