from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from typing import Any

from open_channel import ActorRef, AgentDefinition, AgentHost, EventEnvelope

TextAgent = Callable[[str], str | Awaitable[str]]


async def run_ocp_text_agent(name: str, handler: TextAgent) -> None:
    """Run a text harness behind the OCP Python AgentHost."""

    dispatched: list[EventEnvelope] = []

    async def on_message(context: Any) -> None:
        response = handler(context.message.text)
        if inspect.isawaitable(response):
            response = await response
        await context.reply(str(response))

    host = AgentHost(
        agents=[
            AgentDefinition(
                id=f"agent:{name}",
                name=name,
                description=f"OCP bridge for {name}",
                on_message=on_message,
            )
        ],
        dispatch=dispatched.append,
    )
    event = EventEnvelope.message_received(
        actor=ActorRef(id="human:example", type="ACTOR_TYPE_HUMAN", display_name="Example User"),
        recipient=ActorRef(id=f"agent:{name}", display_name=name),
        text="Explain why OCP keeps policy outside the model prompt.",
    )

    handled = await host.handle(event)
    if not handled or not dispatched:
        raise RuntimeError("The OCP bridge did not dispatch a message.sent reply")

    print(
        {
            "agentCard": host.get_agent_card(f"agent:{name}").to_dict(),
            "eventType": dispatched[0].event_type,
            "correlationId": dispatched[0].correlation_id,
            "reply": dispatched[0].payload["messageSent"]["text"],
        }
    )
