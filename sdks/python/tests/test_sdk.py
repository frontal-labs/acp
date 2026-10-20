import unittest
from datetime import datetime

from acp import (
    AcpApp,
    ActionDefinition,
    ActorRef,
    AgentDefinition,
    AgentHost,
    ChannelDefinition,
    DeliveryReceipt,
    EventEnvelope,
    PolicyDecision,
    event_from_binary,
    event_to_binary,
    message_received,
)
from support import InMemoryStore


class AgentSdkTests(unittest.IsolatedAsyncioTestCase):
    async def test_routes_message_and_dispatches_reply(self) -> None:
        dispatched: list[EventEnvelope] = []

        async def dispatch(event: EventEnvelope) -> None:
            dispatched.append(event)

        async def on_message(context) -> None:
            await context.reply(f"Received: {context.message.text}")

        host = AgentHost(
            agents=[AgentDefinition(id="agent:support", name="Support", on_message=on_message)],
            dispatch=dispatch,
        )
        event = EventEnvelope.message_received(
            actor=ActorRef("human:gabriel", type="ACTOR_TYPE_HUMAN"),
            recipient=ActorRef("agent:support"),
            text="Can you help?",
        )

        self.assertTrue(await host.handle(event))
        self.assertEqual(len(dispatched), 1)
        self.assertEqual(
            dispatched[0].to_proto_json()["messageSent"]["text"], "Received: Can you help?"
        )

    async def test_accepts_proto_json_and_exposes_agent_cards(self) -> None:
        host = AgentHost(
            agents=[AgentDefinition(id="agent:triage", name="Triage", on_message=lambda _: None)]
        )
        event = EventEnvelope.message_received(
            recipient=ActorRef("agent:triage"),
            text="hello",
        )

        self.assertTrue(await host.handle(event.to_proto_json()))
        self.assertEqual(host.list_agent_cards()[0].name, "Triage")

    async def test_app_routes_and_executes_registered_action(self) -> None:
        executions: list[int] = []

        async def on_message(context) -> None:
            result = await context.request_action(
                {"type": "counter.increment", "input": {"value": 2}}
            )
            self.assertEqual(result.status, "executed")

        app = AcpApp(
            store=InMemoryStore(),
            agents=[AgentDefinition(id="agent:app", name="App", on_message=on_message)],
            actions=[
                ActionDefinition(
                    type="counter.increment",
                    execute=lambda value, _event: (
                        executions.append(value["value"]) or value["value"] + 1
                    ),
                )
            ],
            policy=lambda *_args: PolicyDecision(allowed=True),
        )
        event = EventEnvelope.message_received(
            actor=ActorRef("human:app", type="ACTOR_TYPE_HUMAN"),
            recipient=ActorRef("agent:app"),
            text="increment",
        )

        self.assertTrue(await app.ingest(event))
        self.assertEqual(executions, [2])

    async def test_v2_builder_round_trips_without_duplicate_event_type(self) -> None:
        event = message_received(
            text="hello", actor=ActorRef("human:builder"), protocol_version="0.2"
        )

        self.assertEqual(event.event_type, "message.received")
        self.assertNotIn("eventType", event.to_proto_json())
        self.assertEqual(
            event_from_binary(event_to_binary(event), "0.2").payload_case, "messageReceived"
        )

    async def test_app_source_sink_lifecycle_and_duplicate_delivery(self) -> None:
        delivered: list[EventEnvelope] = []
        lifecycle: list[str] = []
        inbound = EventEnvelope.message_received(
            actor=ActorRef("human:source", type="ACTOR_TYPE_HUMAN"),
            channel={"provider": "memory", "channelId": "source"},
            recipient=ActorRef("agent:source"),
            text="hello",
        )

        class Source:
            provider = "memory"

            async def normalize(self, _value, _metadata=None):
                return inbound

            async def start(self, _emit):
                lifecycle.append("start")

            async def stop(self):
                lifecycle.append("stop")

        class Sink:
            provider = "memory"

            async def send(self, event, _options=None):
                delivered.append(event)
                return DeliveryReceipt("memory", event.event_id, datetime.now())

            async def close(self):
                lifecycle.append("close")

        async def on_message(context) -> None:
            await context.reply("reply")

        app = AcpApp(
            store=InMemoryStore(),
            agents=[AgentDefinition(id="agent:source", name="Source", on_message=on_message)],
            channels=[ChannelDefinition("memory", source=Source(), sink=Sink())],
            policy=lambda *_args: PolicyDecision(allowed=True),
        )
        await app.start()
        first = (await app.receive("memory", {}))[0]
        second = (await app.receive("memory", {}))[0]
        await app.stop()

        self.assertFalse(first.duplicate)
        self.assertTrue(second.duplicate)
        self.assertEqual(len(delivered), 1)
        self.assertEqual(lifecycle, ["start", "stop", "close"])


if __name__ == "__main__":
    unittest.main()
