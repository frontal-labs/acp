from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol

from .errors import AcpError, ActionError
from .models import (
    ActorRef,
    AgentCapabilities,
    AgentCard,
    AgentSkill,
    EventEnvelope,
    MessageReceived,
    message_sent,
)

Dispatch = Callable[[EventEnvelope], Any]
ActionHandler = Callable[[Mapping[str, Any], EventEnvelope], Any]
AgentHandler = Callable[["AgentContext"], Any]


async def _maybe_await(value: Any) -> Any:
    return await value if inspect.isawaitable(value) else value


class AgentLogger(Protocol):
    def debug(self, message: str, **details: Any) -> None: ...

    def error(self, message: str, **details: Any) -> None: ...

    def info(self, message: str, **details: Any) -> None: ...

    def warning(self, message: str, **details: Any) -> None: ...


class NullLogger:
    def debug(self, message: str, **details: Any) -> None:
        del message, details

    def error(self, message: str, **details: Any) -> None:
        del message, details

    def info(self, message: str, **details: Any) -> None:
        del message, details

    def warning(self, message: str, **details: Any) -> None:
        del message, details


@dataclass(frozen=True, slots=True)
class AgentDefinition:
    id: str
    name: str
    on_message: AgentHandler
    description: str = ""
    version: str = "0.2.0"
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
class AgentActions:
    _requester: Callable[[str, Any, Mapping[str, Any] | None], Awaitable[Any]]

    async def request(
        self,
        action_type: str,
        input: Any,
        options: Mapping[str, Any] | None = None,
    ) -> Any:
        return await self._requester(action_type, input, options)


@dataclass(slots=True)
class AgentHooks:
    on_error: Callable[[AcpError], Any] | None = None

    async def report(self, error: AcpError) -> None:
        if self.on_error is not None:
            await _maybe_await(self.on_error(error))


@dataclass(slots=True)
class AgentContext:
    agent: ActorRef
    card: AgentCard
    event: EventEnvelope
    message: MessageReceived
    actor: ActorRef | None = None
    recipient: ActorRef | None = None
    channel: Mapping[str, Any] | None = None
    conversation: Mapping[str, Any] | None = None
    raw_event: EventEnvelope | None = None
    actions: AgentActions | None = None
    hooks: AgentHooks = field(default_factory=AgentHooks)
    logger: AgentLogger = field(default_factory=NullLogger)
    _dispatch: Dispatch | None = None
    _action_handler: ActionHandler | None = None
    _replies: list[EventEnvelope] = field(default_factory=list)

    @property
    def replies(self) -> tuple[EventEnvelope, ...]:
        return tuple(self._replies)

    async def reply(
        self,
        text: str,
        options: Mapping[str, Any] | None = None,
    ) -> EventEnvelope:
        options = options or {}
        event = message_sent(
            actor=self.agent,
            channel=options.get("channel", self.event.channel),
            conversation=options.get("conversation", self.event.conversation),
            recipient=options.get("recipient", self.event.actor),
            text=text,
        )
        event.causation_id = self.event.event_id
        event.correlation_id = self.event.correlation_id or self.event.event_id
        self._replies.append(event)
        if self._dispatch is not None:
            await _maybe_await(self._dispatch(event))
        return event

    async def request_action(self, action: Mapping[str, Any]) -> Any:
        if self._action_handler is None:
            raise ActionError("ACP action handling is not configured for this host")
        return await _maybe_await(self._action_handler(action, self.event))


class AgentHost:
    def __init__(
        self,
        *,
        agents: list[AgentDefinition] | None = None,
        dispatch: Dispatch | None = None,
        action_handler: ActionHandler | None = None,
        on_error: Callable[[AcpError], Any] | None = None,
        max_concurrent_conversations: int | None = None,
    ) -> None:
        self._agents: dict[str, AgentDefinition] = {}
        self._dispatch = dispatch
        self._action_handler = action_handler
        self._on_error = on_error
        self._semaphore: Any = None
        self._max_concurrent = max(1, max_concurrent_conversations or 2**31 - 1)
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
        import asyncio

        if self._semaphore is None:
            self._semaphore = asyncio.Semaphore(self._max_concurrent)
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
            actor=envelope.actor,
            agent=ActorRef(
                capabilities=definition.actor_capabilities,
                display_name=definition.name,
                id=definition.id,
            ),
            card=definition.card(),
            channel=envelope.channel,
            conversation=envelope.conversation,
            event=envelope,
            logger=NullLogger(),
            message=message,
            recipient=envelope.recipient,
            raw_event=envelope,
            _action_handler=self._action_handler,
            _dispatch=self._dispatch,
        )
        context.actions = AgentActions(
            lambda action_type, value, options: self._request_action(
                action_type, value, options, envelope
            )
        )
        async with self._semaphore:
            await _maybe_await(definition.on_message(context))
        return True

    async def _request_action(
        self,
        action_type: str,
        value: Any,
        options: Mapping[str, Any] | None,
        event: EventEnvelope,
    ) -> Any:
        action = {"type": action_type, "input": value, **(dict(options or {}))}
        return (
            await _maybe_await(self._action_handler(action, event))
            if self._action_handler
            else ActionError("ACP action handling is not configured for this host")
        )
