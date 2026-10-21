from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TypeAlias
from uuid import uuid4

from ._wire import decode_event, encode_event

# ProtoJSON object produced by the SDK. Inputs accept any Mapping[str, object] instead.
JsonObject: TypeAlias = dict[str, object]


def _mapping(value: object) -> Mapping[str, object]:
    return value if isinstance(value, Mapping) else {}


def _mapping_or_none(value: object) -> Mapping[str, object] | None:
    return value if isinstance(value, Mapping) else None


def _items(value: object) -> list[object]:
    return list(value) if isinstance(value, (list, tuple)) else []


def _optional_mapping(value: object, name: str) -> dict[str, object] | None:
    if value is None:
        return None
    if not isinstance(value, Mapping):
        raise TypeError(f"{name} must be a mapping")
    return dict(value)


def _actor_from_json(value: Mapping[str, object] | None) -> ActorRef | None:
    if value is None:
        return None
    return ActorRef(
        id=str(value.get("id", "")),
        type=str(value.get("type", "ACTOR_TYPE_UNSPECIFIED")),
        display_name=str(value.get("displayName", "")),
        authority=str(value.get("authority", "")),
        capabilities=tuple(str(item) for item in _items(value.get("capabilities"))),
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
    def from_dict(cls, value: Mapping[str, object]) -> MessageReceived:
        attachments: list[dict[str, object]] = []
        for item in _items(value.get("attachments")):
            if not isinstance(item, Mapping):
                raise TypeError("messageReceived attachments must be mappings")
            attachments.append(dict(item))
        return cls(
            text=str(value.get("text", "")),
            attachments=tuple(attachments),
            metadata={str(key): str(item) for key, item in _mapping(value.get("metadata")).items()},
        )


OCP_PROTOCOL_VERSION = "0.1"
OCP_V2_PROTOCOL_VERSION = "0.2"
OCP_PROTOCOL_VERSIONS = (OCP_PROTOCOL_VERSION, OCP_V2_PROTOCOL_VERSION)

# Mirrors packages/protocol/src/events.ts. Payload case -> default event name.
EVENT_TYPE_BY_PAYLOAD_CASE: dict[str, str] = {
    "actionExecuted": "action.executed",
    "actionFailed": "action.failed",
    "approvalDecided": "approval.granted",
    "approvalExpired": "approval.expired",
    "approvalRequested": "approval.requested",
    "escalationTriggered": "escalation.triggered",
    "handoffCompleted": "handoff.completed",
    "handoffInitiated": "handoff.initiated",
    "messageReceived": "message.received",
    "messageSent": "message.sent",
    "policyEvaluated": "policy.allowed",
    "taskAssigned": "task.assigned",
    "taskCreated": "task.created",
}

# Event name -> required payload case.
PAYLOAD_CASE_BY_EVENT_TYPE: dict[str, str] = {
    "action.executed": "actionExecuted",
    "action.failed": "actionFailed",
    "approval.denied": "approvalDecided",
    "approval.expired": "approvalExpired",
    "approval.granted": "approvalDecided",
    "approval.requested": "approvalRequested",
    "escalation.triggered": "escalationTriggered",
    "handoff.completed": "handoffCompleted",
    "handoff.initiated": "handoffInitiated",
    "message.received": "messageReceived",
    "message.sent": "messageSent",
    "policy.allowed": "policyEvaluated",
    "policy.blocked": "policyEvaluated",
    "task.assigned": "taskAssigned",
    "task.created": "taskCreated",
}

_GRANTED_OUTCOMES = ("APPROVAL_OUTCOME_GRANTED", 1)
_DENIED_OUTCOMES = ("APPROVAL_OUTCOME_DENIED", 2)


def _typed_cases(payload: Mapping[str, object]) -> list[str]:
    return [key for key in payload if key in EVENT_TYPE_BY_PAYLOAD_CASE]


def _payload_case(payload: Mapping[str, object]) -> str:
    cases = _typed_cases(payload)
    if len(cases) != 1:
        raise ValueError("OCP event must have exactly one typed payload")
    return cases[0]


def _payload_event_type(payload: Mapping[str, object]) -> str:
    """Event name implied by the payload oneof (approvals and policy decisions are disambiguated)."""

    case = _payload_case(payload)
    value = _mapping(payload[case])
    if case == "approvalDecided":
        return "approval.denied" if value.get("outcome") in _DENIED_OUTCOMES else "approval.granted"
    if case == "policyEvaluated":
        return "policy.allowed" if value.get("allowed") else "policy.blocked"
    return EVENT_TYPE_BY_PAYLOAD_CASE[case]


def event_type_of(event: EventEnvelope) -> str:
    """Return the dot-separated event name derived from the payload, for either protocol version."""

    return _payload_event_type(event.payload)


def _check_payload_case(event_type: str, payload: Mapping[str, object]) -> None:
    expected = PAYLOAD_CASE_BY_EVENT_TYPE.get(event_type)
    if expected is None:
        raise ValueError(f"Unsupported OCP event type: {event_type}")
    cases = _typed_cases(payload)
    if cases != [expected]:
        received = ", ".join(cases) or "none"
        raise ValueError(
            f"OCP event {event_type} requires payload case {expected}, received {received}"
        )


def _check_asserted_event_type(event_type: str, payload: Mapping[str, object]) -> None:
    """v0.2 does not store the event name, so a caller-supplied name must still match the payload."""

    _check_payload_case(event_type, payload)
    derived = _payload_event_type(payload)
    if derived != event_type:
        raise ValueError(f"OCP event {event_type} does not match payload event {derived}")


def _check_invariants(event_type: str, payload: Mapping[str, object]) -> None:
    case = _payload_case(payload)
    value = _mapping(payload[case])
    if case == "approvalRequested":
        if not str(value.get("approvalId", "")).strip():
            raise ValueError("approval.requested must have an approval_id")
        if not (value.get("agent") and value.get("approver")):
            raise ValueError("approval.requested must identify an agent and approver")
        if not value.get("requestedAction"):
            raise ValueError("approval.requested must include a requested_action")
        if not value.get("deadline"):
            raise ValueError("approval.requested must have a deadline")
    if case == "approvalDecided":
        if not str(value.get("approvalId", "")).strip():
            raise ValueError("approval decision must have an approval_id")
        outcome = value.get("outcome")
        if outcome not in _GRANTED_OUTCOMES and outcome not in _DENIED_OUTCOMES:
            raise ValueError("approval decision must be granted or denied")
        if event_type == "approval.granted" and outcome not in _GRANTED_OUTCOMES:
            raise ValueError("approval.granted must have a granted outcome")
        if event_type == "approval.denied" and outcome not in _DENIED_OUTCOMES:
            raise ValueError("approval.denied must have a denied outcome")
    if case == "policyEvaluated":
        allowed = bool(value.get("allowed"))
        if event_type == "policy.allowed" and not allowed:
            raise ValueError("policy.allowed must have allowed=true")
        if event_type == "policy.blocked" and allowed:
            raise ValueError("policy.blocked must have allowed=false")


def validate_event(event: EventEnvelope) -> None:
    """Validate identity, protocol version, payload mapping, and approval/policy invariants."""

    if not event.event_id.strip():
        raise ValueError("OCP event must have an event_id")
    if event.protocol_version not in OCP_PROTOCOL_VERSIONS:
        raise ValueError(f"Unsupported OCP protocol_version: {event.protocol_version!r}")
    if not event.occurred_at.strip():
        raise ValueError("OCP event must have occurred_at")
    if not event.payload:
        raise ValueError("OCP event must have a payload")
    if event.protocol_version == OCP_V2_PROTOCOL_VERSION:
        name = _payload_event_type(event.payload)
        if event.event_type != name:
            _check_asserted_event_type(event.event_type, event.payload)
    else:
        if not event.event_type.strip():
            raise ValueError("OCP event must have an event_type")
        name = event.event_type
        _check_payload_case(name, event.payload)
    _check_invariants(name, event.payload)


def _timestamp(value: datetime | str) -> str:
    if isinstance(value, str):
        return value
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


@dataclass(slots=True)
class EventEnvelope:
    """OCP event envelope for protocol v0.1 (stores event_type) or v0.2 (payload-derived name).

    Default protocol_version is "0.1". For v0.2 the event_type is derived from the payload; a
    caller-supplied event_type is only checked against the payload.
    """

    event_type: str = ""
    payload: Mapping[str, object] = field(default_factory=dict)
    event_id: str = field(default_factory=lambda: str(uuid4()))
    protocol_version: str = OCP_PROTOCOL_VERSION
    occurred_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    source: ActorRef | None = None
    actor: ActorRef | None = None
    recipient: ActorRef | None = None
    channel: Mapping[str, object] | None = None
    conversation: Mapping[str, object] | None = None
    correlation_id: str = ""
    causation_id: str = ""
    idempotency_key: str = ""
    extensions: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.protocol_version == OCP_V2_PROTOCOL_VERSION:
            if self.event_type:
                _check_asserted_event_type(self.event_type, self.payload)
            else:
                self.event_type = _payload_event_type(self.payload)
        validate_event(self)

    @property
    def payload_case(self) -> str:
        return _payload_case(self.payload)

    @classmethod
    def message_received(
        cls,
        *,
        actor: ActorRef | None = None,
        recipient: ActorRef | None = None,
        text: str,
        channel: Mapping[str, object] | None = None,
        conversation: Mapping[str, object] | None = None,
        protocol_version: str = OCP_PROTOCOL_VERSION,
    ) -> EventEnvelope:
        return message_received(
            actor=actor,
            recipient=recipient,
            text=text,
            channel=channel,
            conversation=conversation,
            protocol_version=protocol_version,
        )

    @classmethod
    def from_proto_json(cls, value: Mapping[str, object]) -> EventEnvelope:
        """Parse ProtoJSON. The shape is selected by protocolVersion (missing means v0.1)."""

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
        protocol_version = str(value.get("protocolVersion", OCP_PROTOCOL_VERSION))
        if protocol_version == OCP_V2_PROTOCOL_VERSION:
            if "eventType" in value:
                raise ValueError("OCP v0.2 envelope must not include eventType")
            event_type = ""
        elif protocol_version == OCP_PROTOCOL_VERSION:
            event_type = str(value.get("eventType", ""))
        else:
            raise ValueError(f"Unsupported OCP protocol_version: {protocol_version!r}")
        payload = {key: item for key, item in value.items() if key not in known_fields}
        return cls(
            actor=_actor_from_json(_mapping_or_none(value.get("actor"))),
            causation_id=str(value.get("causationId", "")),
            channel=_optional_mapping(value.get("channel"), "channel"),
            conversation=_optional_mapping(value.get("conversation"), "conversation"),
            correlation_id=str(value.get("correlationId", "")),
            event_id=str(value.get("eventId", "")),
            event_type=event_type,
            extensions={
                str(key): str(item) for key, item in _mapping(value.get("extensions")).items()
            },
            idempotency_key=str(value.get("idempotencyKey", "")),
            occurred_at=str(value.get("occurredAt", "")),
            payload=payload,
            protocol_version=protocol_version,
            recipient=_actor_from_json(_mapping_or_none(value.get("recipient"))),
            source=_actor_from_json(_mapping_or_none(value.get("source"))),
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
        if self.protocol_version != OCP_V2_PROTOCOL_VERSION:
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


def _build(
    event_type: str,
    payload: Mapping[str, object],
    *,
    protocol_version: str,
    actor: ActorRef | None,
    source: ActorRef | None,
    recipient: ActorRef | None,
    channel: Mapping[str, object] | None,
    conversation: Mapping[str, object] | None,
    correlation_id: str,
    causation_id: str,
    event_id: str | None,
) -> EventEnvelope:
    return EventEnvelope(
        event_type=event_type,
        payload=payload,
        event_id=event_id or str(uuid4()),
        protocol_version=protocol_version,
        occurred_at=datetime.now(UTC).isoformat(),
        actor=actor,
        source=source,
        recipient=recipient,
        channel=channel,
        conversation=conversation,
        correlation_id=correlation_id,
        causation_id=causation_id,
    )


def message_received(
    *,
    text: str,
    protocol_version: str = OCP_PROTOCOL_VERSION,
    actor: ActorRef | None = None,
    recipient: ActorRef | None = None,
    source: ActorRef | None = None,
    channel: Mapping[str, object] | None = None,
    conversation: Mapping[str, object] | None = None,
    attachments: Sequence[Mapping[str, object]] = (),
    metadata: Mapping[str, str] | None = None,
    correlation_id: str = "",
    causation_id: str = "",
    event_id: str | None = None,
) -> EventEnvelope:
    """Build a `message.received` event for the requested protocol version (default v0.1)."""

    value: JsonObject = {"text": text}
    if attachments:
        value["attachments"] = [dict(item) for item in attachments]
    if metadata:
        value["metadata"] = dict(metadata)
    return _build(
        "message.received",
        {"messageReceived": value},
        protocol_version=protocol_version,
        actor=actor,
        source=actor if source is None else source,
        recipient=recipient,
        channel=channel,
        conversation=conversation,
        correlation_id=correlation_id,
        causation_id=causation_id,
        event_id=event_id,
    )


def message_sent(
    *,
    text: str,
    protocol_version: str = OCP_PROTOCOL_VERSION,
    actor: ActorRef | None = None,
    recipient: ActorRef | None = None,
    source: ActorRef | None = None,
    channel: Mapping[str, object] | None = None,
    conversation: Mapping[str, object] | None = None,
    attachments: Sequence[Mapping[str, object]] = (),
    metadata: Mapping[str, str] | None = None,
    correlation_id: str = "",
    causation_id: str = "",
    event_id: str | None = None,
) -> EventEnvelope:
    """Build a `message.sent` event for the requested protocol version (default v0.1)."""

    value: JsonObject = {"text": text}
    if attachments:
        value["attachments"] = [dict(item) for item in attachments]
    if metadata:
        value["metadata"] = dict(metadata)
    return _build(
        "message.sent",
        {"messageSent": value},
        protocol_version=protocol_version,
        actor=actor,
        source=actor if source is None else source,
        recipient=recipient,
        channel=channel,
        conversation=conversation,
        correlation_id=correlation_id,
        causation_id=causation_id,
        event_id=event_id,
    )


def approval_requested(
    *,
    agent: ActorRef,
    approver: ActorRef,
    approval_id: str,
    reason: str,
    requested_action: Mapping[str, object],
    deadline: datetime | str,
    protocol_version: str = OCP_PROTOCOL_VERSION,
    actor: ActorRef | None = None,
    recipient: ActorRef | None = None,
    source: ActorRef | None = None,
    channel: Mapping[str, object] | None = None,
    conversation: Mapping[str, object] | None = None,
    correlation_id: str = "",
    causation_id: str = "",
    event_id: str | None = None,
) -> EventEnvelope:
    """Build an `approval.requested` event for the requested protocol version (default v0.1)."""

    payload = {
        "approvalRequested": {
            "agent": agent.to_proto_json(),
            "approvalId": approval_id,
            "approver": approver.to_proto_json(),
            "reason": reason,
            "requestedAction": dict(requested_action),
            "deadline": _timestamp(deadline),
        }
    }
    return _build(
        "approval.requested",
        payload,
        protocol_version=protocol_version,
        actor=actor,
        source=source,
        recipient=approver if recipient is None else recipient,
        channel=channel,
        conversation=conversation,
        correlation_id=correlation_id,
        causation_id=causation_id,
        event_id=event_id,
    )


def action_executed(
    *,
    action: Mapping[str, object],
    result: str = "",
    protocol_version: str = OCP_PROTOCOL_VERSION,
    actor: ActorRef | None = None,
    recipient: ActorRef | None = None,
    source: ActorRef | None = None,
    channel: Mapping[str, object] | None = None,
    conversation: Mapping[str, object] | None = None,
    correlation_id: str = "",
    causation_id: str = "",
    event_id: str | None = None,
) -> EventEnvelope:
    """Build an `action.executed` event for the requested protocol version (default v0.1)."""

    return _build(
        "action.executed",
        {"actionExecuted": {"action": dict(action), "result": result}},
        protocol_version=protocol_version,
        actor=actor,
        source=source,
        recipient=recipient,
        channel=channel,
        conversation=conversation,
        correlation_id=correlation_id,
        causation_id=causation_id,
        event_id=event_id,
    )


def action_failed(
    *,
    action: Mapping[str, object],
    error_code: str,
    error_message: str,
    retryable: bool = False,
    protocol_version: str = OCP_PROTOCOL_VERSION,
    actor: ActorRef | None = None,
    recipient: ActorRef | None = None,
    source: ActorRef | None = None,
    channel: Mapping[str, object] | None = None,
    conversation: Mapping[str, object] | None = None,
    correlation_id: str = "",
    causation_id: str = "",
    event_id: str | None = None,
) -> EventEnvelope:
    """Build an `action.failed` event for the requested protocol version (default v0.1)."""

    payload = {
        "actionFailed": {
            "action": dict(action),
            "errorCode": error_code,
            "errorMessage": error_message,
            "retryable": retryable,
        }
    }
    return _build(
        "action.failed",
        payload,
        protocol_version=protocol_version,
        actor=actor,
        source=source,
        recipient=recipient,
        channel=channel,
        conversation=conversation,
        correlation_id=correlation_id,
        causation_id=causation_id,
        event_id=event_id,
    )


def parse_event(
    value: bytes | bytearray | Mapping[str, object],
    protocol_version: str | None = None,
) -> EventEnvelope:
    """Parse an event: a ProtoJSON mapping (version auto-detected) or binary bytes.

    Binary does not carry a version discriminator, so bytes require `protocol_version`.
    """

    if isinstance(value, (bytes, bytearray)):
        if protocol_version is None:
            raise ValueError("Binary OCP events require an explicit protocol_version")
        return event_from_binary(value, protocol_version)
    if not isinstance(value, Mapping):
        raise TypeError("OCP events must be ProtoJSON mappings or bytes")
    return EventEnvelope.from_proto_json(value)


def event_to_json(event: EventEnvelope) -> JsonObject:
    validate_event(event)
    return event.to_proto_json()


def event_from_json(value: Mapping[str, object]) -> EventEnvelope:
    return EventEnvelope.from_proto_json(value)


def event_to_binary(event: EventEnvelope) -> bytes:
    """Serialize a validated event of either version as protobuf wire bytes.

    The bytes are the protobuf encoding of the v0.1 or v0.2 EventEnvelope (selected by
    `event.protocol_version`), byte-compatible with the TypeScript SDK. The encoding is produced by
    the stdlib-only codec in `open_channel._wire`; no protobuf runtime is required.
    """

    validate_event(event)
    return encode_event(event.to_proto_json(), event.protocol_version)


def event_from_binary(value: bytes | bytearray, protocol_version: str) -> EventEnvelope:
    """Decode protobuf wire bytes as an EventEnvelope of the explicitly requested version.

    Binary carries no version discriminator, so `protocol_version` is required. The bytes are
    decoded with the v0.1 or v0.2 envelope schema accordingly, then validated; a decoded event
    whose protocol_version differs from the requested one raises ValueError.
    """

    if protocol_version not in OCP_PROTOCOL_VERSIONS:
        raise ValueError(f"Unsupported OCP protocol_version: {protocol_version!r}")
    try:
        decoded = decode_event(bytes(value), protocol_version)
    except ValueError as error:
        raise ValueError("Invalid OCP binary event") from error
    event = EventEnvelope.from_proto_json(decoded)
    if event.protocol_version != protocol_version:
        raise ValueError(
            f"OCP binary event has protocol_version {event.protocol_version}, "
            f"expected {protocol_version}"
        )
    validate_event(event)
    return event
