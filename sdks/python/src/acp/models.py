from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

JsonObject = dict[str, Any]


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
        value: JsonObject = {
            "id": self.id,
            "type": self.type,
            "displayName": self.display_name,
        }
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
    version: str = "0.1.0"
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


@dataclass(slots=True)
class EventEnvelope:
    event_type: str
    payload: Mapping[str, Any]
    event_id: str = field(default_factory=lambda: str(uuid4()))
    protocol_version: str = "0.1"
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
        return cls(
            actor=actor,
            channel=channel,
            conversation=conversation,
            event_type="message.received",
            payload={"messageReceived": {"text": text}},
            recipient=recipient,
            source=actor,
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
            payload={key: item for key, item in value.items() if key not in known_fields},
            protocol_version=str(value.get("protocolVersion", "")),
            recipient=_actor_from_json(value.get("recipient")),
            source=_actor_from_json(value.get("source")),
        )

    def message_received_payload(self) -> MessageReceived | None:
        value = self.payload.get("messageReceived")
        return MessageReceived.from_dict(value) if isinstance(value, Mapping) else None

    def to_proto_json(self) -> JsonObject:
        value: JsonObject = {
            "eventId": self.event_id,
            "eventType": self.event_type,
            "protocolVersion": self.protocol_version,
            "occurredAt": self.occurred_at,
        }
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
