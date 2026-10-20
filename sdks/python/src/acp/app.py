from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Generic, Literal, Protocol, TypeVar
from uuid import uuid4

from .errors import AcpError, ActionError, DeliveryError, as_acp_error
from .host import AgentDefinition, AgentHost, _maybe_await
from .models import ActorRef, AgentCard, EventEnvelope

InputT = TypeVar("InputT")


@dataclass(frozen=True, slots=True)
class DeliveryReceipt:
    provider: str
    event_id: str
    delivered_at: datetime
    external_id: str | None = None


class ChannelSource(Protocol):
    provider: str

    async def normalize(
        self, value: object, metadata: Mapping[str, object] | None = None
    ) -> EventEnvelope | list[EventEnvelope]: ...

    async def start(self, emit: Callable[[EventEnvelope], Awaitable[object]]) -> None: ...

    async def stop(self) -> None: ...


class ChannelSink(Protocol):
    provider: str

    async def send(
        self, event: EventEnvelope, options: Mapping[str, object] | None = None
    ) -> object: ...

    async def close(self) -> None: ...


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


ActionStatus = Literal["blocked", "approval_required", "executed", "failed"]


@dataclass(frozen=True, slots=True)
class ActionResult:
    action_id: str
    status: ActionStatus
    approval_id: str = ""
    reason: str = ""
    result: object = None
    error: ActionError | None = None


@dataclass(slots=True)
class ActionExecutionContext:
    actor: ActorRef
    event: EventEnvelope
    app: AcpApp


@dataclass(frozen=True, slots=True)
class ActionDefinition(Generic[InputT]):
    """A named application action. `validate` (optional) converts raw input to `InputT`."""

    type: str
    execute: Callable[[InputT, ActionExecutionContext], object]
    validate: Callable[[object], InputT] | None = None


# The action registry is heterogeneous: each action's input type is enforced by its own validate/execute.
AnyActionDefinition = ActionDefinition[Any]

Policy = Callable[
    [str, ActorRef, object, EventEnvelope], PolicyDecision | Awaitable[PolicyDecision]
]
Hook = Callable[..., object]


@dataclass(slots=True)
class AcpHooks:
    on_event_accepted: Hook | None = None
    on_event_processed: Hook | None = None
    on_action_started: Hook | None = None
    on_action_completed: Hook | None = None
    on_delivery: Hook | None = None
    on_error: Hook | None = None


class DurableStore(Protocol):
    async def append_if_absent(self, event: EventEnvelope) -> bool: ...

    async def all(self) -> list[EventEnvelope]: ...

    async def close(self) -> None: ...


@dataclass(slots=True)
class _PendingAction:
    action_id: str
    approval_id: str
    definition: AnyActionDefinition
    actor: ActorRef
    event: EventEnvelope
    input: object
    expiry: asyncio.Task[None] | None = None


@dataclass(slots=True)
class IngestResult:
    duplicate: bool
    emitted: list[EventEnvelope] = field(default_factory=list)

    def __bool__(self) -> bool:
        return not self.duplicate


class AcpApp:
    """Config-first, lifecycle-managed Python application facade for ACP."""

    def __init__(
        self,
        *,
        store: DurableStore,
        agents: list[AgentDefinition] | None = None,
        actions: list[AnyActionDefinition] | None = None,
        channels: list[ChannelDefinition] | None = None,
        policy: Policy | None = None,
        hooks: AcpHooks | None = None,
        on_event: Hook | None = None,
        max_concurrent_conversations: int | None = None,
        default_approval_timeout_ms: int = 60_000,
    ) -> None:
        self._actions = {action.type: action for action in actions or []}
        self._channels = {channel.provider: channel for channel in channels or []}
        self._events: dict[str, EventEnvelope] = {}
        self._pending: dict[str, _PendingAction] = {}
        self._action_results: dict[str, ActionResult] = {}
        self._claimed_actions: set[str] = set()
        self._locks: dict[str, asyncio.Lock] = {}
        self._inflight: set[asyncio.Task[object]] = set()
        self._source_tasks: set[asyncio.Task[object]] = set()
        self._semaphore = asyncio.Semaphore(max(1, max_concurrent_conversations or 2**31 - 1))
        self._policy = policy or (
            lambda _type, _actor, _input, _event: PolicyDecision(
                False, reason="No policy configured"
            )
        )
        self._hooks = hooks or AcpHooks(on_event_accepted=on_event)
        if on_event is not None and self._hooks.on_event_accepted is None:
            self._hooks.on_event_accepted = on_event
        self._store = store
        self._started = False
        self._accepting = True
        self._approval_timeout = max(0, default_approval_timeout_ms) / 1000
        self._host = AgentHost(
            agents=agents,
            dispatch=self._dispatch,
            action_handler=self._request_action,
            on_error=self._report_error,
            max_concurrent_conversations=max_concurrent_conversations,
        )

    def register_agent(self, agent: AgentDefinition) -> None:
        self._host.register(agent)

    def register_action(self, action: AnyActionDefinition) -> None:
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
        if not self._accepting:
            raise AcpError("ACP app has already stopped", stage="shutdown")
        self._started = True
        for channel in self._channels.values():
            if channel.source is None or not hasattr(channel.source, "start"):
                continue
            task = asyncio.create_task(self._run_source(channel.source))
            self._source_tasks.add(task)
            task.add_done_callback(self._source_tasks.discard)
        await asyncio.sleep(0)

    async def stop(self, *, timeout_ms: int = 30_000) -> None:
        if not self._accepting:
            return
        self._accepting = False
        timeout = max(0, timeout_ms) / 1000
        try:
            await asyncio.wait_for(self._stop_sources(), timeout)
            if self._inflight:
                await asyncio.wait_for(
                    asyncio.gather(*self._inflight, return_exceptions=True), timeout
                )
            for channel in self._channels.values():
                if channel.sink is not None and hasattr(channel.sink, "close"):
                    await asyncio.wait_for(_maybe_await(channel.sink.close()), timeout)
            if hasattr(self._store, "close"):
                await asyncio.wait_for(_maybe_await(self._store.close()), timeout)
        except TimeoutError as error:
            await self._report_error(
                AcpError("ACP shutdown timed out", stage="shutdown", retryable=True)
            )
            raise AcpError("ACP shutdown timed out", stage="shutdown", retryable=True) from error
        finally:
            self._started = False

    async def ingest(self, event: EventEnvelope) -> IngestResult:
        if not self._accepting:
            raise AcpError("ACP app is stopping", stage="accept", retryable=True)
        if not await self._store.append_if_absent(event):
            return IngestResult(duplicate=True)
        self._events[event.event_id] = event
        await self._run_hook(self._hooks.on_event_accepted, event)
        task = asyncio.current_task()
        if task is not None:
            self._inflight.add(task)
        try:
            key = self._conversation_key(event)
            lock = self._locks.get(key)
            if lock is None:
                lock = self._locks[key] = asyncio.Lock()
            async with lock, self._semaphore:
                await self._host.handle(event)
            await self._run_hook(self._hooks.on_event_processed, event)
            return IngestResult(duplicate=False)
        finally:
            if task is not None:
                self._inflight.discard(task)

    async def receive(
        self,
        provider: str,
        value: object,
        metadata: Mapping[str, object] | None = None,
    ) -> list[IngestResult]:
        if not self._accepting:
            raise AcpError("ACP app is stopping", stage="accept", retryable=True)
        channel = self._channels.get(provider)
        if channel is None or channel.source is None:
            raise DeliveryError(
                f"No ACP source registered for provider: {provider}",
                provider=provider,
                stage="normalize",
            )
        try:
            normalized = await channel.source.normalize(value, metadata)
        except Exception as error:
            classified = as_acp_error(error, provider=provider, stage="normalize", retryable=True)
            await self._report_error(classified)
            raise classified from error
        events = normalized if isinstance(normalized, list) else [normalized]
        return [await self.ingest(event) for event in events]

    async def approve(
        self, approval_id: str, approver: ActorRef | None = None, reason: str = "Approved"
    ) -> ActionResult:
        del approver
        pending = self._pending.pop(approval_id, None)
        if pending is None:
            raise KeyError(f"ACP approval was not found: {approval_id}")
        if pending.expiry is not None:
            pending.expiry.cancel()
        result = await self._execute(pending)
        await self._run_hook(self._hooks.on_action_completed, result)
        return result

    async def deny(
        self, approval_id: str, approver: ActorRef | None = None, reason: str = "Denied"
    ) -> ActionResult:
        del approver
        pending = self._pending.pop(approval_id, None)
        if pending is None:
            raise KeyError(f"ACP approval was not found: {approval_id}")
        if pending.expiry is not None:
            pending.expiry.cancel()
        result = ActionResult(pending.action_id, "blocked", approval_id=approval_id, reason=reason)
        self._action_results[pending.action_id] = result
        await self._run_hook(self._hooks.on_action_completed, result)
        return result

    async def _run_source(self, source: ChannelSource) -> None:
        try:
            await source.start(self.ingest)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            await self._report_error(
                as_acp_error(error, provider=source.provider, stage="processing", retryable=True)
            )

    async def _stop_sources(self) -> None:
        for channel in self._channels.values():
            if channel.source is not None and hasattr(channel.source, "stop"):
                await _maybe_await(channel.source.stop())
        if self._source_tasks:
            await asyncio.gather(*self._source_tasks, return_exceptions=True)

    async def _dispatch(self, event: EventEnvelope) -> DeliveryReceipt:
        provider = str((event.channel or {}).get("provider", ""))
        channel = self._channels.get(provider)
        if channel is None or channel.sink is None:
            error = DeliveryError(
                f"No ACP sink registered for provider: {provider}",
                event_id=event.event_id,
                provider=provider,
                retryable=True,
                stage="delivery",
            )
            await self._report_error(error)
            raise error
        try:
            receipt = await _maybe_await(channel.sink.send(event))
            if isinstance(receipt, DeliveryReceipt):
                result = receipt
            else:
                result = DeliveryReceipt(
                    provider, event.event_id, datetime.now(), str(receipt) if receipt else None
                )
            await self._run_hook(self._hooks.on_delivery, result)
            return result
        except Exception as error:
            classified = as_acp_error(
                error,
                event_id=event.event_id,
                provider=provider,
                stage="delivery",
                retryable=True,
            )
            await self._report_error(classified)
            raise classified from error

    async def _request_action(
        self, action: Mapping[str, object], event: EventEnvelope
    ) -> ActionResult:
        action_type = str(action.get("type", ""))
        definition = self._actions.get(action_type)
        if definition is None:
            error = ActionError(
                f"No ACP action is registered for type: {action_type}", stage="validation"
            )
            await self._report_error(error)
            raise error
        action_id = str(action["actionId"]) if "actionId" in action else f"action:{uuid4()}"
        previous = self._action_results.get(action_id)
        if previous is not None:
            return previous
        if action_id in self._claimed_actions:
            return ActionResult(
                action_id,
                "failed",
                error=ActionError("ACP action has already been claimed", action_id=action_id),
            )
        self._claimed_actions.add(action_id)
        value: object = action.get("input", action.get("parameters", {}))
        try:
            if definition.validate is not None:
                value = definition.validate(value)
            actor = event.actor or ActorRef("")
            decision = self._policy(action_type, actor, value, event)
            if isinstance(decision, Awaitable):
                decision = await decision
            if not decision.allowed:
                result = ActionResult(action_id, "blocked", reason=decision.reason)
                self._action_results[action_id] = result
                return result
            pending = _PendingAction(action_id, "", definition, actor, event, value)
            if decision.approval_required:
                approval_id = f"{action_id}:approval"
                pending.approval_id = approval_id
                self._pending[approval_id] = pending
                pending.expiry = asyncio.create_task(self._expire(approval_id))
                result = ActionResult(action_id, "approval_required", approval_id=approval_id)
                self._action_results[action_id] = result
                return result
            return await self._execute(pending)
        except Exception as error:
            classified = (
                error
                if isinstance(error, ActionError)
                else ActionError(str(error), action_id=action_id, cause=error)
            )
            result = ActionResult(action_id, "failed", error=classified)
            self._action_results[action_id] = result
            await self._run_hook(self._hooks.on_action_completed, result)
            await self._report_error(classified)
            return result

    async def _execute(self, pending: _PendingAction) -> ActionResult:
        await self._run_hook(
            self._hooks.on_action_started,
            {
                "actionId": pending.action_id,
                "type": pending.definition.type,
            },
        )
        context = ActionExecutionContext(pending.actor, pending.event, self)
        try:
            result = await _maybe_await(pending.definition.execute(pending.input, context))
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
            output = ActionResult(pending.action_id, "executed", result=result)
            self._action_results[pending.action_id] = output
            await self._run_hook(self._hooks.on_action_completed, output)
            return output
        except Exception as error:
            classified = (
                error
                if isinstance(error, ActionError)
                else ActionError(str(error), action_id=pending.action_id, cause=error)
            )
            failed_event = EventEnvelope(
                actor=pending.actor,
                channel=pending.event.channel,
                conversation=pending.event.conversation,
                correlation_id=pending.event.correlation_id or pending.action_id,
                causation_id=pending.event.event_id,
                event_type="action.failed",
                payload={
                    "actionFailed": {
                        "action": {"actionId": pending.action_id, "type": pending.definition.type},
                        "errorCode": classified.code,
                        "errorMessage": str(classified),
                        "retryable": classified.retryable,
                    }
                },
                recipient=pending.event.recipient,
                source=pending.actor,
            )
            await self._record(failed_event)
            output = ActionResult(pending.action_id, "failed", error=classified)
            self._action_results[pending.action_id] = output
            await self._run_hook(self._hooks.on_action_completed, output)
            await self._report_error(classified)
            return output

    async def _expire(self, approval_id: str) -> None:
        await asyncio.sleep(self._approval_timeout)
        pending = self._pending.pop(approval_id, None)
        if pending is None:
            return
        result = ActionResult(
            pending.action_id, "blocked", approval_id=approval_id, reason="Approval expired"
        )
        self._action_results[pending.action_id] = result
        await self._run_hook(self._hooks.on_action_completed, result)

    async def _record(self, event: EventEnvelope) -> bool:
        if not await self._store.append_if_absent(event):
            return False
        self._events[event.event_id] = event
        await self._run_hook(self._hooks.on_event_accepted, event)
        await self._run_hook(self._hooks.on_event_processed, event)
        return True

    async def _run_hook(self, hook: Hook | None, value: object) -> None:
        if hook is None:
            return
        try:
            await _maybe_await(hook(value))
        except Exception as error:
            if hook is not self._hooks.on_error:
                await self._report_error(as_acp_error(error, stage="processing"))

    async def _report_error(self, error: AcpError) -> None:
        if self._hooks.on_error is not None:
            try:
                await _maybe_await(self._hooks.on_error(error))
            except Exception:
                return

    @staticmethod
    def _conversation_key(event: EventEnvelope) -> str:
        if event.conversation and event.conversation.get("id"):
            return f"conversation:{event.conversation['id']}"
        channel = event.channel or {}
        return f"channel:{channel.get('provider', '')}:{channel.get('channelId', '')}:{channel.get('threadId', '')}"
