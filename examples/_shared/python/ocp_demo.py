from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from typing import Any

from open_channel import (
    ActorRef,
    AgentDefinition,
    ChannelDefinition,
    EventEnvelope,
    PolicyDecision,
    event_type,
    message_received,
    open_channel,
)

TextAgent = Callable[[str], str | Awaitable[str]]
PROVIDER = "ocp-example"


class MemoryStore:
    """Example-only event store. Production apps pass a durable store to `open_channel(store=...)`."""

    def __init__(self) -> None:
        self._events: dict[str, EventEnvelope] = {}

    async def append_if_absent(self, event: EventEnvelope) -> bool:
        if event.event_id in self._events:
            return False
        self._events[event.event_id] = event
        return True

    async def all(self) -> list[EventEnvelope]:
        return list(self._events.values())

    async def close(self) -> None:
        return None


async def run_ocp_text_agent(name: str, handler: TextAgent) -> None:
    """Run a text harness behind an OCP app. The agent replies through the channel sink."""

    dispatched: list[EventEnvelope] = []

    async def on_message(context: Any) -> None:
        response = handler(context.message.text)
        if inspect.isawaitable(response):
            response = await response
        await context.reply(str(response))

    class ExampleSink:
        provider = PROVIDER

        async def send(self, event: EventEnvelope, options: Any = None) -> None:
            dispatched.append(event)

    app = open_channel(
        store=MemoryStore(),
        policy=lambda *_args: PolicyDecision(allowed=True),
        agents=[
            AgentDefinition(
                id=f"agent:{name}",
                name=name,
                description=f"OCP bridge for {name}",
                on_message=on_message,
            )
        ],
        channels=[ChannelDefinition(PROVIDER, sink=ExampleSink())],
    )
    event = message_received(
        actor=ActorRef(id="human:example", type="ACTOR_TYPE_HUMAN", display_name="Example User"),
        recipient=ActorRef(id=f"agent:{name}", display_name=name),
        channel={"provider": PROVIDER, "channelId": "example"},
        text="Explain why OCP keeps policy outside the model prompt.",
    )

    await app.ingest(event)
    if not dispatched:
        raise RuntimeError("The OCP bridge did not dispatch a message.sent reply")

    print(
        {
            "agentCard": app.agent_cards()[0].to_json(),
            "eventType": event_type(dispatched[0]),
            "correlationId": dispatched[0].correlation_id,
            "reply": dispatched[0].payload["messageSent"]["text"],
        }
    )
