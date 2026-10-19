from __future__ import annotations

import inspect
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from .models import (
    ActorRef,
    AgentCapabilities,
    AgentCard,
    AgentSkill,
    EventEnvelope,
    MessageReceived,
)

Dispatch = Callable[[EventEnvelope], Any]
ActionHandler = Callable[[Mapping[str, Any], EventEnvelope], Any]
AgentHandler = Callable[["AgentContext"], Any]


async def _maybe_await(value: Any) -> Any:
    return await value if inspect.isawaitable(value) else value


@dataclass(frozen=True, slots=True)
class AgentDefinition:
    id: str
    name: str
    on_message: AgentHandler
    description: str = ""
    version: str = "0.1.0"
    url: str = ""
    capabilities: AgentCapabilities = field(default_factory=AgentCapabilities)
    skills: tuple[AgentSkill, ...] = ()
    actor_capabilities: tuple[str, ...] = ()

    def card(self) -> AgentCard:
        return AgentCard(
            capabilities=self.capabilities,
            description=self.description,
            id=self.id,
            name=self.name,
            skills=self.skills,
            url=self.url,
            version=self.version,
        )


@dataclass(slots=True)
class AgentContext:
    agent: ActorRef
    card: AgentCard
    event: EventEnvelope
    message: MessageReceived
    _dispatch: Dispatch | None = None
    _action_handler: ActionHandler | None = None
    _replies: list[EventEnvelope] = field(default_factory=list)

    @property
    def replies(self) -> tuple[EventEnvelope, ...]:
        return tuple(self._replies)

    async def reply(self, text: str) -> EventEnvelope:
        event = EventEnvelope(
            actor=self.agent,
            channel=self.event.channel,
            conversation=self.event.conversation,
            correlation_id=self.event.correlation_id or self.event.event_id,
            causation_id=self.event.event_id,
            event_type="message.sent",
            payload={"messageSent": {"text": text}},
            recipient=self.event.actor,
            source=self.agent,
        )
        self._replies.append(event)
        if self._dispatch is not None:
            await _maybe_await(self._dispatch(event))
        return event

    async def request_action(self, action: Mapping[str, Any]) -> Any:
        if self._action_handler is None:
            raise RuntimeError("ACP action handling is not configured for this host")
        return await _maybe_await(self._action_handler(action, self.event))


class AgentHost:
    def __init__(
        self,
        *,
        agents: list[AgentDefinition] | None = None,
        dispatch: Dispatch | None = None,
        action_handler: ActionHandler | None = None,
    ) -> None:
        self._agents: dict[str, AgentDefinition] = {}
        self._dispatch = dispatch
        self._action_handler = action_handler
        for agent in agents or []:
            self.register(agent)

    def register(self, agent: AgentDefinition) -> AgentHost:
        if agent.id in self._agents:
            raise ValueError(f"ACP agent is already registered: {agent.id}")
        self._agents[agent.id] = agent
        return self

    def unregister(self, agent_id: str) -> bool:
        return self._agents.pop(agent_id, None) is not None

    def get_agent(self, agent_id: str) -> AgentDefinition | None:
        return self._agents.get(agent_id)

    def get_agent_card(self, agent_id: str) -> AgentCard | None:
        agent = self.get_agent(agent_id)
        return agent.card() if agent is not None else None

    def list_agent_cards(self) -> tuple[AgentCard, ...]:
        return tuple(agent.card() for agent in self._agents.values())

    async def handle(self, event: EventEnvelope | Mapping[str, Any]) -> bool:
        envelope = (
            event if isinstance(event, EventEnvelope) else EventEnvelope.from_proto_json(event)
        )
        message = envelope.message_received_payload()
        if envelope.event_type != "message.received" or message is None:
            return False

        agent_id = envelope.recipient.id if envelope.recipient is not None else ""
        definition = self._agents.get(agent_id)
        if definition is None:
            return False

        context = AgentContext(
            agent=ActorRef(
                capabilities=definition.actor_capabilities,
                display_name=definition.name,
                id=definition.id,
            ),
            card=definition.card(),
            event=envelope,
            message=message,
            _action_handler=self._action_handler,
            _dispatch=self._dispatch,
        )
        await _maybe_await(definition.on_message(context))
        return True
