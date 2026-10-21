import unittest
from datetime import datetime

from open_channel import (
    ActionDefinition,
    ActorRef,
    AgentDefinition,
    AgentHost,
    AuthorizationError,
    ChannelDefinition,
    DeliveryReceipt,
    EventEnvelope,
    OcpApp,
    PolicyDecision,
    approval_requested,
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

        app = OcpApp(
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

    async def _request_approval(self, approver: ActorRef | None, executions: list[int]):
        approvals: dict[str, object] = {}

        async def on_message(context) -> None:
            result = await context.request_action(
                {"type": "counter.increment", "input": {"value": 1}}
            )
            approvals["result"] = result

        app = OcpApp(
            store=InMemoryStore(),
            agents=[AgentDefinition(id="agent:approve", name="Approve", on_message=on_message)],
            actions=[
                ActionDefinition(
                    type="counter.increment",
                    execute=lambda value, _event: (
                        executions.append(value["value"]) or value["value"] + 1
                    ),
                )
            ],
            policy=lambda *_args: PolicyDecision(
                allowed=True, approval_required=True, approver=approver
            ),
        )
        event = EventEnvelope.message_received(
            actor=ActorRef("human:requester", type="ACTOR_TYPE_HUMAN"),
            recipient=ActorRef("agent:approve"),
            text="increment",
        )
        await app.ingest(event)
        result = approvals["result"]
        self.assertEqual(result.status, "approval_required")
        return app, result.approval_id

    async def test_approval_is_only_decided_by_designated_approver(self) -> None:
        executions: list[int] = []
        approver = ActorRef("human:approver", type="ACTOR_TYPE_HUMAN")
        app, approval_id = await self._request_approval(approver, executions)

        intruder = ActorRef("human:intruder", type="ACTOR_TYPE_HUMAN")
        with self.assertRaises(AuthorizationError):
            await app.approve(approval_id, intruder)
        with self.assertRaises(AuthorizationError):
            await app.deny(approval_id, intruder)
        self.assertEqual(executions, [])

        # A rejected attempt must not consume the pending approval.
        result = await app.approve(approval_id, approver)
        self.assertEqual(result.status, "executed")
        self.assertEqual(executions, [1])

    async def test_approval_without_designated_approver_uses_runtime_actor(self) -> None:
        executions: list[int] = []
        app, approval_id = await self._request_approval(None, executions)

        with self.assertRaises(AuthorizationError):
            await app.deny(approval_id, ActorRef("human:intruder", type="ACTOR_TYPE_HUMAN"))
        result = await app.deny(approval_id, ActorRef("ocp.runtime", type="ACTOR_TYPE_SYSTEM"))
        self.assertEqual(result.status, "blocked")
        self.assertEqual(executions, [])

    async def test_rejects_forged_approval_events_on_ingest(self) -> None:
        app = OcpApp(
            store=InMemoryStore(),
            policy=lambda *_args: PolicyDecision(allowed=True),
        )
        forged = approval_requested(
            agent=ActorRef("agent:forged"),
            approver=ActorRef("human:approver", type="ACTOR_TYPE_HUMAN"),
            approval_id="forged-approval",
            reason="forged",
            requested_action={"type": "counter.increment", "input": {}},
            deadline="2030-01-01T00:00:00Z",
        )

        with self.assertRaises(AuthorizationError):
            await app.ingest(forged)
        self.assertEqual(app._pending, {})

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

        app = OcpApp(
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
