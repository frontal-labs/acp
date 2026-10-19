from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, TypeAlias
from uuid import uuid4

JsonObject: TypeAlias = dict[str, Any]


def _actor_from_json(value: Mapping[str, Any] | None) -> ActorRef | None:
    if value is None:
        return None
    return ActorRef(
        id=str(value.get("id", "")),
        type=str(value.get("type", "ACTOR_TYPE_UNSPECIFIED")),
        display_name=str(value.get("displayName", "")),
        authority=str(value.get("authority", "")),
        capabilities=tuple(str(item) for item in value.get("capabilities", [])),
    )


@dataclass(frozen=True, slots=True)
class ActorRef:
    id: str
    type: str = "ACTOR_TYPE_AGENT"
    display_name: str = ""
    authority: str = ""
    capabilities: tuple[str, ...] = ()

    def to_proto_json(self) -> JsonObject:
        value: JsonObject = {"id": self.id, "type": self.type, "displayName": self.display_name}
        if self.authority:
            value["authority"] = self.authority
        if self.capabilities:
            value["capabilities"] = list(self.capabilities)
        return value


@dataclass(frozen=True, slots=True)
class AgentCapabilities:
    push_notifications: bool = False
    state_transition_history: bool = False
    streaming: bool = False

    def to_proto_json(self) -> JsonObject:
        return {
            "pushNotifications": self.push_notifications,
            "stateTransitionHistory": self.state_transition_history,
            "streaming": self.streaming,
        }


@dataclass(frozen=True, slots=True)
class AgentSkill:
    id: str
    name: str
    description: str = ""
    tags: tuple[str, ...] = ()
    examples: tuple[str, ...] = ()

    def to_dict(self) -> JsonObject:
        value: JsonObject = {"id": self.id, "name": self.name}
        if self.description:
            value["description"] = self.description
        if self.tags:
            value["tags"] = list(self.tags)
        if self.examples:
            value["examples"] = list(self.examples)
        return value


@dataclass(frozen=True, slots=True)
class AgentCard:
    id: str
    name: str
    description: str = ""
    version: str = "0.2.0"
    url: str = ""
    capabilities: AgentCapabilities = field(default_factory=AgentCapabilities)
    skills: tuple[AgentSkill, ...] = ()

    def to_dict(self) -> JsonObject:
        value: JsonObject = {
            "id": self.id,
            "name": self.name,
            "version": self.version,
            "capabilities": self.capabilities.to_proto_json(),
            "skills": [skill.to_dict() for skill in self.skills],
        }
        if self.description:
            value["description"] = self.description
        if self.url:
            value["url"] = self.url
        return value


@dataclass(frozen=True, slots=True)
class MessageReceived:
    text: str
    attachments: tuple[JsonObject, ...] = ()
    metadata: Mapping[str, str] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> MessageReceived:
        return cls(
            text=str(value.get("text", "")),
            attachments=tuple(dict(item) for item in value.get("attachments", [])),
            metadata={str(key): str(item) for key, item in value.get("metadata", {}).items()},
        )


_PAYLOAD_TO_EVENT: dict[str, str] = {
    "messageReceived": "message.received",
    "messageSent": "message.sent",
    "taskCreated": "task.created",
    "taskAssigned": "task.assigned",
    "approvalRequested": "approval.requested",
    "approvalDecided": "approval.granted",
    "approvalExpired": "approval.expired",
    "escalationTriggered": "escalation.triggered",
    "handoffInitiated": "handoff.initiated",
    "handoffCompleted": "handoff.completed",
    "policyEvaluated": "policy.allowed",
    "actionExecuted": "action.executed",
    "actionFailed": "action.failed",
}


def _event_kind(payload: Mapping[str, Any]) -> str:
    cases = [key for key in payload if key in _PAYLOAD_TO_EVENT]
    if len(cases) != 1:
        raise ValueError("ACP v2 events require exactly one typed payload")
    return _PAYLOAD_TO_EVENT[cases[0]]


@dataclass(slots=True)
class EventEnvelope:
    """Portable v0.2 envelope with a payload-derived event kind."""

    event_type: str
    payload: Mapping[str, Any]
    event_id: str = field(default_factory=lambda: str(uuid4()))
    protocol_version: str = "0.2"
    occurred_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    source: ActorRef | None = None
    actor: ActorRef | None = None
    recipient: ActorRef | None = None
    channel: JsonObject | None = None
    conversation: JsonObject | None = None
    correlation_id: str = ""
    causation_id: str = ""
    idempotency_key: str = ""
    extensions: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        derived = _event_kind(self.payload)
        if not self.event_type:
            self.event_type = derived
        elif self.event_type != derived:
            raise ValueError(
                f"ACP event type {self.event_type!r} does not match payload kind {derived!r}"
            )

    @property
    def payload_case(self) -> str:
        return next(key for key in self.payload if key in _PAYLOAD_TO_EVENT)

    @classmethod
    def message_received(
        cls,
        *,
        actor: ActorRef | None = None,
        recipient: ActorRef | None = None,
        text: str,
        channel: JsonObject | None = None,
        conversation: JsonObject | None = None,
    ) -> EventEnvelope:
        return message_received(
            actor=actor,
            recipient=recipient,
            text=text,
            channel=channel,
            conversation=conversation,
        )

    @classmethod
    def from_proto_json(cls, value: Mapping[str, Any]) -> EventEnvelope:
        known_fields = {
            "actor",
            "causationId",
            "channel",
            "conversation",
            "correlationId",
            "eventId",
            "eventType",
            "extensions",
            "idempotencyKey",
            "occurredAt",
            "protocolVersion",
            "recipient",
            "source",
        }
        payload = {key: item for key, item in value.items() if key not in known_fields}
        return cls(
            actor=_actor_from_json(value.get("actor")),
            causation_id=str(value.get("causationId", "")),
            channel=dict(value["channel"]) if value.get("channel") else None,
            conversation=dict(value["conversation"]) if value.get("conversation") else None,
            correlation_id=str(value.get("correlationId", "")),
            event_id=str(value.get("eventId", "")),
            event_type=str(value.get("eventType", "")),
            extensions={str(key): str(item) for key, item in value.get("extensions", {}).items()},
            idempotency_key=str(value.get("idempotencyKey", "")),
            occurred_at=str(value.get("occurredAt", "")),
            payload=payload,
            protocol_version=str(value.get("protocolVersion", "0.2")),
            recipient=_actor_from_json(value.get("recipient")),
            source=_actor_from_json(value.get("source")),
        )

    def message_received_payload(self) -> MessageReceived | None:
        value = self.payload.get("messageReceived")
        return MessageReceived.from_dict(value) if isinstance(value, Mapping) else None

    def to_proto_json(self) -> JsonObject:
        value: JsonObject = {
            "eventId": self.event_id,
            "protocolVersion": self.protocol_version,
            "occurredAt": self.occurred_at,
        }
        if self.protocol_version != "0.2":
            value["eventType"] = self.event_type
        for name, actor in (
            ("source", self.source),
            ("actor", self.actor),
            ("recipient", self.recipient),
        ):
            if actor is not None:
                value[name] = actor.to_proto_json()
        for name, item in (("channel", self.channel), ("conversation", self.conversation)):
            if item is not None:
                value[name] = item
        if self.correlation_id:
            value["correlationId"] = self.correlation_id
        if self.causation_id:
            value["causationId"] = self.causation_id
        if self.idempotency_key:
            value["idempotencyKey"] = self.idempotency_key
        if self.extensions:
            value["extensions"] = dict(self.extensions)
        value.update(self.payload)
        return value


def message_received(**kwargs: Any) -> EventEnvelope:
    actor = kwargs.get("actor")
    return EventEnvelope(
        actor=actor,
        channel=kwargs.get("channel"),
        conversation=kwargs.get("conversation"),
        event_type="message.received",
        payload={"messageReceived": {"text": str(kwargs["text"])}},
        recipient=kwargs.get("recipient"),
        source=actor,
    )


def message_sent(**kwargs: Any) -> EventEnvelope:
    actor = kwargs.get("actor")
    return EventEnvelope(
        actor=actor,
        channel=kwargs.get("channel"),
        conversation=kwargs.get("conversation"),
        event_type="message.sent",
        payload={"messageSent": {"text": str(kwargs["text"])}},
        recipient=kwargs.get("recipient"),
        source=actor,
    )


def approval_requested(**kwargs: Any) -> EventEnvelope:
    return EventEnvelope(
        actor=kwargs.get("actor"),
        channel=kwargs.get("channel"),
        conversation=kwargs.get("conversation"),
        event_type="approval.requested",
        payload={
            "approvalRequested": {
                "agent": kwargs["agent"].to_proto_json(),
                "approvalId": kwargs["approval_id"],
                "approver": kwargs["approver"].to_proto_json(),
                "reason": kwargs["reason"],
                "requestedAction": kwargs["requested_action"],
            }
        },
        recipient=kwargs.get("approver"),
        source=kwargs.get("source"),
    )


def action_executed(**kwargs: Any) -> EventEnvelope:
    return EventEnvelope(
        actor=kwargs.get("actor"),
        event_type="action.executed",
        payload={"actionExecuted": {"action": kwargs["action"], "result": kwargs.get("result")}},
        channel=kwargs.get("channel"),
        conversation=kwargs.get("conversation"),
        source=kwargs.get("source"),
    )


def parse_event(value: bytes | bytearray | Mapping[str, Any]) -> EventEnvelope:
    if isinstance(value, (bytes, bytearray)):
        raw = bytes(value)
        if raw.startswith(b"ACP2\n"):
            raw = raw[5:]
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("Invalid ACP v2 binary event") from error
    if not isinstance(value, Mapping):
        raise TypeError("ACP events must be ProtoJSON mappings or bytes")
    return EventEnvelope.from_proto_json(value)


def event_to_json(event: EventEnvelope) -> JsonObject:
    return event.to_proto_json()


def event_from_json(value: Mapping[str, Any]) -> EventEnvelope:
    return EventEnvelope.from_proto_json(value)


def event_to_binary(event: EventEnvelope) -> bytes:
    """Return deterministic v0.2 bytes without adding a runtime dependency."""

    return (
        b"ACP2\n"
        + json.dumps(event.to_proto_json(), sort_keys=True, separators=(",", ":")).encode()
    )


def event_from_binary(value: bytes | bytearray) -> EventEnvelope:
    return parse_event(value)
