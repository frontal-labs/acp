import unittest

from acp import (
    AcpApp,
    ActionDefinition,
    ActorRef,
    AgentDefinition,
    AgentHost,
    EventEnvelope,
    PolicyDecision,
)


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


if __name__ == "__main__":
    unittest.main()
