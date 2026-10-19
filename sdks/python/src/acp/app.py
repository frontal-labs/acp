from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import uuid4

from .host import AgentDefinition, AgentHost
from .models import ActorRef, AgentCard, EventEnvelope


class ChannelSource(Protocol):
    provider: str

    async def normalize(
        self, value: Any, metadata: Mapping[str, Any] | None = None
    ) -> EventEnvelope | list[EventEnvelope]: ...

    async def start(self, emit: Callable[[EventEnvelope], Awaitable[None]]) -> None: ...

    async def stop(self) -> None: ...


class ChannelSink(Protocol):
    provider: str

    async def send(self, event: EventEnvelope) -> Any: ...


@dataclass(frozen=True, slots=True)
class ChannelDefinition:
    provider: str
    source: ChannelSource | None = None
    sink: ChannelSink | None = None


@dataclass(frozen=True, slots=True)
class PolicyDecision:
    allowed: bool
    approval_required: bool = False
    reason: str = ""


@dataclass(frozen=True, slots=True)
class ActionResult:
    action_id: str
    status: str
    approval_id: str = ""
    reason: str = ""
    result: Any = None
    error: Any = None


@dataclass(frozen=True, slots=True)
class ActionDefinition:
    type: str
    execute: Callable[[Any, EventEnvelope], Any]
    validate: Callable[[Any], Any] | None = None


Policy = Callable[[str, ActorRef, Any, EventEnvelope], PolicyDecision]
Hook = Callable[[EventEnvelope], Any]


@dataclass(slots=True)
class _PendingAction:
    action_id: str
    approval_id: str
    definition: ActionDefinition
    actor: ActorRef
    event: EventEnvelope
    input: Any


class AcpApp:
    """Config-first Python application facade for ACP agents and channels."""

    def __init__(
        self,
        *,
        agents: list[Any] | None = None,
        actions: list[ActionDefinition] | None = None,
        channels: list[ChannelDefinition] | None = None,
        policy: Policy | None = None,
        on_event: Hook | None = None,
    ) -> None:
        self._actions = {action.type: action for action in actions or []}
        self._channels = {channel.provider: channel for channel in channels or []}
        self._events: dict[str, EventEnvelope] = {}
        self._pending: dict[str, _PendingAction] = {}
        self._locks: dict[str, Any] = {}
        self._policy = policy or (
            lambda _type, _actor, _input, _event: PolicyDecision(
                False, reason="No policy configured"
            )
        )
        self._on_event = on_event
        self._started = False
        self._host = AgentHost(
            agents=agents,
            dispatch=self._dispatch,
            action_handler=self._request_action,
        )

    def register_agent(self, agent: AgentDefinition) -> None:
        self._host.register(agent)

    def register_action(self, action: ActionDefinition) -> None:
        if action.type in self._actions:
            raise ValueError(f"ACP action is already registered: {action.type}")
        self._actions[action.type] = action

    def register_channel(self, channel: ChannelDefinition) -> None:
        if channel.provider in self._channels:
            raise ValueError(f"ACP channel is already registered: {channel.provider}")
        self._channels[channel.provider] = channel

    def list_agent_cards(self) -> tuple[AgentCard, ...]:
        return self._host.list_agent_cards()

    async def start(self) -> None:
        if self._started:
            return
        self._started = True
        for channel in self._channels.values():
            if channel.source is not None:
                start = getattr(channel.source, "start", None)
                if start is not None:
                    await start(self.ingest)

    async def stop(self) -> None:
        if not self._started:
            return
        for channel in self._channels.values():
            if channel.source is not None:
                stop = getattr(channel.source, "stop", None)
                if stop is not None:
                    await stop()
        self._started = False

    async def ingest(self, event: EventEnvelope) -> bool:
        if event.event_id in self._events:
            return False
        await self._record(event)

        key = self._conversation_key(event)
        lock = self._locks.setdefault(key, self._new_lock())
        async with lock:
            await self._host.handle(event)
        return True

    async def receive(
        self,
        provider: str,
        value: Any,
        metadata: Mapping[str, Any] | None = None,
    ) -> list[bool]:
        channel = self._channels.get(provider)
        if channel is None or channel.source is None:
            raise ValueError(f"No ACP source registered for provider: {provider}")
        normalized = await channel.source.normalize(value, metadata)
        events = normalized if isinstance(normalized, list) else [normalized]
        return [await self.ingest(event) for event in events]

    async def approve(self, approval_id: str) -> ActionResult:
        pending = self._pending.pop(approval_id, None)
        if pending is None:
            raise KeyError(f"ACP approval was not found: {approval_id}")
        return await self._execute(pending)

    def deny(self, approval_id: str, reason: str = "Denied") -> ActionResult:
        pending = self._pending.pop(approval_id, None)
        if pending is None:
            raise KeyError(f"ACP approval was not found: {approval_id}")
        return ActionResult(pending.action_id, "blocked", approval_id=approval_id, reason=reason)

    async def _dispatch(self, event: EventEnvelope) -> None:
        self._events.setdefault(event.event_id, event)
        channel = self._channels.get(str((event.channel or {}).get("provider", "")))
        if channel is None or channel.sink is None:
            return
        await self._maybe_await(channel.sink.send(event))

    async def _request_action(
        self, action: Mapping[str, Any], event: EventEnvelope
    ) -> ActionResult:
        action_type = str(action.get("type", ""))
        definition = self._actions.get(action_type)
        if definition is None:
            raise ValueError(f"No ACP action is registered for type: {action_type}")

        value = action.get("input", action.get("parameters", {}))
        if definition.validate is not None:
            value = definition.validate(value)
        action_id = str(action.get("actionId", f"action:{uuid4()}"))
        decision = self._policy(action_type, event.actor or ActorRef(""), value, event)
        if not decision.allowed:
            return ActionResult(action_id, "blocked", reason=decision.reason)
        if decision.approval_required:
            approval_id = f"{action_id}:approval"
            self._pending[approval_id] = _PendingAction(
                action_id, approval_id, definition, event.actor or ActorRef(""), event, value
            )
            return ActionResult(action_id, "approval_required", approval_id=approval_id)
        return await self._execute(
            _PendingAction(action_id, "", definition, event.actor or ActorRef(""), event, value)
        )

    async def _execute(self, pending: _PendingAction) -> ActionResult:
        try:
            result = await self._maybe_await(
                pending.definition.execute(pending.input, pending.event)
            )
            event = EventEnvelope(
                actor=pending.actor,
                channel=pending.event.channel,
                conversation=pending.event.conversation,
                correlation_id=pending.event.correlation_id or pending.action_id,
                causation_id=pending.event.event_id,
                event_type="action.executed",
                payload={
                    "actionExecuted": {
                        "action": {"actionId": pending.action_id, "type": pending.definition.type},
                        "result": result,
                    }
                },
                recipient=pending.event.recipient,
                source=pending.actor,
            )
            await self._record(event)
            return ActionResult(pending.action_id, "executed", result=result)
        except Exception as error:
            return ActionResult(pending.action_id, "failed", error=error)

    @staticmethod
    async def _maybe_await(value: Any) -> Any:
        return await value if inspect.isawaitable(value) else value

    async def _record(self, event: EventEnvelope) -> None:
        if event.event_id in self._events:
            return
        self._events[event.event_id] = event
        if self._on_event is not None:
            await self._maybe_await(self._on_event(event))

    @staticmethod
    def _new_lock() -> Any:
        import asyncio

        return asyncio.Lock()

    @staticmethod
    def _conversation_key(event: EventEnvelope) -> str:
        if event.conversation and event.conversation.get("id"):
            return f"conversation:{event.conversation['id']}"
        channel = event.channel or {}
        return f"channel:{channel.get('provider', '')}:{channel.get('channelId', '')}:{channel.get('threadId', '')}"
