//! OCP event envelopes for both wire protocol versions.
//!
//! - `0.1` stores the event name in `eventType` next to the payload.
//! - `0.2` has no `eventType`; the payload oneof is the event kind.
//!
//! The same constructors build either version; the version is the first argument. Binary
//! protobuf is produced by prost from the generated types (see `binary.rs`), and the ProtoJSON
//! form is produced with serde. Mirrors `packages/protocol/src/events.ts`, `builders.ts`, and
//! `serialization.ts`.

use std::collections::BTreeMap;
use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::de::DeserializeOwned;
use serde_json::{Map, Value};
use thiserror::Error;
use uuid::Uuid;

use crate::binary;
use crate::models::{
    ActionInvocation, ActorRef, ChannelRef, ConversationRef, MessageReceived, MessageSent,
};
use crate::payloads::{
    ActionExecuted, ActionFailed, ApprovalDecided, ApprovalExpired, ApprovalOutcome,
    ApprovalRequested, EscalationTriggered, HandoffCompleted, HandoffInitiated, PolicyEvaluated,
    TaskAssigned, TaskCreated,
};

/// Wire protocol version of an envelope. Defaults to `0.1`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum ProtocolVersion {
    /// Legacy envelope that stores `eventType` next to the payload.
    #[default]
    V0_1,
    /// Payload-discriminated envelope; the event name is derived from the payload.
    V0_2,
}

impl ProtocolVersion {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::V0_1 => "0.1",
            Self::V0_2 => "0.2",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "0.1" => Some(Self::V0_1),
            "0.2" => Some(Self::V0_2),
            _ => None,
        }
    }
}

impl fmt::Display for ProtocolVersion {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Debug, Error)]
pub enum EventError {
    #[error("invalid OCP event: {0}")]
    Invalid(String),
    #[error("OCP event JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("OCP binary event cannot be decoded: {0}")]
    Decode(#[from] prost::DecodeError),
}

pub(crate) fn invalid(message: impl Into<String>) -> EventError {
    EventError::Invalid(message.into())
}

/// Domain payload carried by an envelope. Every variant has a protobuf and a ProtoJSON encoding.
#[derive(Clone, Debug, PartialEq)]
pub enum EventPayload {
    MessageReceived(MessageReceived),
    MessageSent(MessageSent),
    TaskCreated(TaskCreated),
    TaskAssigned(TaskAssigned),
    ApprovalRequested(ApprovalRequested),
    /// Granted or denied; see [`ApprovalOutcome`].
    ApprovalDecided(ApprovalDecided),
    ApprovalExpired(ApprovalExpired),
    EscalationTriggered(EscalationTriggered),
    HandoffInitiated(HandoffInitiated),
    HandoffCompleted(HandoffCompleted),
    PolicyEvaluated(PolicyEvaluated),
    ActionExecuted(ActionExecuted),
    ActionFailed(ActionFailed),
}

/// ProtoJSON payload keys, one per oneof field.
const PAYLOAD_KEYS: [&str; 13] = [
    "messageReceived",
    "messageSent",
    "taskCreated",
    "taskAssigned",
    "approvalRequested",
    "approvalDecided",
    "approvalExpired",
    "escalationTriggered",
    "handoffInitiated",
    "handoffCompleted",
    "policyEvaluated",
    "actionExecuted",
    "actionFailed",
];

impl EventPayload {
    /// Dot-separated event name implied by the payload.
    pub fn event_type(&self) -> &'static str {
        match self {
            Self::MessageReceived(_) => "message.received",
            Self::MessageSent(_) => "message.sent",
            Self::TaskCreated(_) => "task.created",
            Self::TaskAssigned(_) => "task.assigned",
            Self::ApprovalRequested(_) => "approval.requested",
            Self::ApprovalDecided(decision) => {
                if decision.outcome == ApprovalOutcome::Denied {
                    "approval.denied"
                } else {
                    "approval.granted"
                }
            }
            Self::ApprovalExpired(_) => "approval.expired",
            Self::EscalationTriggered(_) => "escalation.triggered",
            Self::HandoffInitiated(_) => "handoff.initiated",
            Self::HandoffCompleted(_) => "handoff.completed",
            Self::PolicyEvaluated(policy) => {
                if policy.allowed {
                    "policy.allowed"
                } else {
                    "policy.blocked"
                }
            }
            Self::ActionExecuted(_) => "action.executed",
            Self::ActionFailed(_) => "action.failed",
        }
    }

    fn json_key(&self) -> &'static str {
        PAYLOAD_KEYS[match self {
            Self::MessageReceived(_) => 0,
            Self::MessageSent(_) => 1,
            Self::TaskCreated(_) => 2,
            Self::TaskAssigned(_) => 3,
            Self::ApprovalRequested(_) => 4,
            Self::ApprovalDecided(_) => 5,
            Self::ApprovalExpired(_) => 6,
            Self::EscalationTriggered(_) => 7,
            Self::HandoffInitiated(_) => 8,
            Self::HandoffCompleted(_) => 9,
            Self::PolicyEvaluated(_) => 10,
            Self::ActionExecuted(_) => 11,
            Self::ActionFailed(_) => 12,
        }]
    }

    fn to_json_value(&self) -> Result<Value, EventError> {
        Ok(match self {
            Self::MessageReceived(payload) => serde_json::to_value(payload)?,
            Self::MessageSent(payload) => serde_json::to_value(payload)?,
            Self::TaskCreated(payload) => serde_json::to_value(payload)?,
            Self::TaskAssigned(payload) => serde_json::to_value(payload)?,
            Self::ApprovalRequested(payload) => serde_json::to_value(payload)?,
            Self::ApprovalDecided(payload) => serde_json::to_value(payload)?,
            Self::ApprovalExpired(payload) => serde_json::to_value(payload)?,
            Self::EscalationTriggered(payload) => serde_json::to_value(payload)?,
            Self::HandoffInitiated(payload) => serde_json::to_value(payload)?,
            Self::HandoffCompleted(payload) => serde_json::to_value(payload)?,
            Self::PolicyEvaluated(payload) => serde_json::to_value(payload)?,
            Self::ActionExecuted(payload) => serde_json::to_value(payload)?,
            Self::ActionFailed(payload) => serde_json::to_value(payload)?,
        })
    }

    fn payload_from_json(key: &str, value: &Value) -> Result<Self, EventError> {
        fn parse<T: DeserializeOwned>(value: &Value) -> Result<T, EventError> {
            Ok(serde_json::from_value(value.clone())?)
        }
        Ok(match key {
            "messageReceived" => Self::MessageReceived(parse(value)?),
            "messageSent" => Self::MessageSent(parse(value)?),
            "taskCreated" => Self::TaskCreated(parse(value)?),
            "taskAssigned" => Self::TaskAssigned(parse(value)?),
            "approvalRequested" => Self::ApprovalRequested(parse(value)?),
            "approvalDecided" => Self::ApprovalDecided(parse(value)?),
            "approvalExpired" => Self::ApprovalExpired(parse(value)?),
            "escalationTriggered" => Self::EscalationTriggered(parse(value)?),
            "handoffInitiated" => Self::HandoffInitiated(parse(value)?),
            "handoffCompleted" => Self::HandoffCompleted(parse(value)?),
            "policyEvaluated" => Self::PolicyEvaluated(parse(value)?),
            "actionExecuted" => Self::ActionExecuted(parse(value)?),
            "actionFailed" => Self::ActionFailed(parse(value)?),
            other => return Err(invalid(format!("unknown payload {other}"))),
        })
    }

    fn validate(&self) -> Result<(), EventError> {
        match self {
            Self::ApprovalRequested(payload) => {
                require_text(&payload.approval_id, "approval.requested", "approvalId")?;
                if payload.requested_action.is_none() {
                    return Err(invalid("approval.requested must include requestedAction"));
                }
            }
            Self::ApprovalDecided(payload) => {
                require_text(&payload.approval_id, "approval decision", "approvalId")?;
                match payload.outcome {
                    ApprovalOutcome::Granted | ApprovalOutcome::Denied => {}
                    _ => return Err(invalid("approval decision must be granted or denied")),
                }
            }
            Self::ApprovalExpired(payload) => {
                require_text(&payload.approval_id, "approval.expired", "approvalId")?;
            }
            Self::ActionExecuted(ActionExecuted { action: None, .. }) => {
                return Err(invalid("action.executed must include action"));
            }
            Self::ActionFailed(ActionFailed { action: None, .. }) => {
                return Err(invalid("action.failed must include action"));
            }
            _ => {}
        }
        Ok(())
    }
}

fn require_text(value: &str, context: &str, key: &str) -> Result<(), EventError> {
    if value.trim().is_empty() {
        Err(invalid(format!("{context} must have a non-empty {key}")))
    } else {
        Ok(())
    }
}

/// An OCP envelope for either protocol version.
///
/// The shape follows the version: `event_type` is `Some` for `0.1` and `None` for `0.2`.
/// Use [`EventEnvelope::validate`] (also run by the JSON and binary codecs) to check it.
#[derive(Clone, Debug, PartialEq)]
pub struct EventEnvelope {
    pub event_id: String,
    pub protocol_version: ProtocolVersion,
    /// Stored event name. Required for `0.1`, must be absent for `0.2`.
    pub event_type: Option<String>,
    /// RFC 3339 UTC timestamp. Fractional seconds are kept at millisecond, microsecond, or
    /// nanosecond precision, whichever the source provides.
    pub occurred_at: String,
    pub source: Option<ActorRef>,
    pub actor: Option<ActorRef>,
    pub recipient: Option<ActorRef>,
    pub channel: Option<ChannelRef>,
    pub conversation: Option<ConversationRef>,
    pub correlation_id: String,
    pub causation_id: String,
    pub idempotency_key: String,
    pub extensions: BTreeMap<String, String>,
    pub payload: EventPayload,
}

impl EventEnvelope {
    /// Builds an envelope from an explicit event name and rejects a name that does not match
    /// the payload, for either version.
    pub fn with_event_type(
        protocol_version: ProtocolVersion,
        event_type: &str,
        payload: EventPayload,
    ) -> Result<Self, EventError> {
        let derived = payload.event_type();
        if event_type != derived {
            return Err(invalid(format!(
                "event type {event_type} does not match payload event {derived}"
            )));
        }
        let event = envelope(protocol_version, payload);
        event.validate()?;
        Ok(event)
    }

    pub fn message_received_payload(&self) -> Option<&MessageReceived> {
        match &self.payload {
            EventPayload::MessageReceived(message) => Some(message),
            _ => None,
        }
    }

    /// Checks identity, protocol version and shape agreement, and payload invariants.
    pub fn validate(&self) -> Result<(), EventError> {
        if self.event_id.trim().is_empty() {
            return Err(invalid("event_id is required"));
        }
        if self.occurred_at.trim().is_empty() {
            return Err(invalid("occurred_at is required"));
        }
        match (self.protocol_version, &self.event_type) {
            (ProtocolVersion::V0_1, None) => {
                return Err(invalid("protocol 0.1 envelope requires event_type"));
            }
            (ProtocolVersion::V0_2, Some(_)) => {
                return Err(invalid(
                    "protocol 0.2 envelope must not carry event_type; the name is derived from the payload",
                ));
            }
            _ => {}
        }
        if let Some(event_type) = &self.event_type {
            let derived = self.payload.event_type();
            if event_type != derived {
                return Err(invalid(format!(
                    "event_type {event_type} does not match payload event {derived}"
                )));
            }
        }
        self.payload.validate()
    }

    /// Serializes to ProtoJSON-style JSON, with `eventType` only for `0.1`.
    pub fn to_proto_json(&self) -> Result<Value, EventError> {
        self.validate()?;
        let mut object = Map::new();
        object.insert("eventId".to_owned(), Value::String(self.event_id.clone()));
        object.insert(
            "protocolVersion".to_owned(),
            Value::String(self.protocol_version.as_str().to_owned()),
        );
        if let Some(event_type) = &self.event_type {
            object.insert("eventType".to_owned(), Value::String(event_type.clone()));
        }
        object.insert("occurredAt".to_owned(), Value::String(self.occurred_at.clone()));
        insert_optional(&mut object, "source", &self.source)?;
        insert_optional(&mut object, "actor", &self.actor)?;
        insert_optional(&mut object, "recipient", &self.recipient)?;
        insert_optional(&mut object, "channel", &self.channel)?;
        insert_optional(&mut object, "conversation", &self.conversation)?;
        insert_text(&mut object, "correlationId", &self.correlation_id);
        insert_text(&mut object, "causationId", &self.causation_id);
        insert_text(&mut object, "idempotencyKey", &self.idempotency_key);
        if !self.extensions.is_empty() {
            object.insert("extensions".to_owned(), serde_json::to_value(&self.extensions)?);
        }
        object.insert(self.payload.json_key().to_owned(), self.payload.to_json_value()?);
        Ok(Value::Object(object))
    }

    /// Parses an untrusted ProtoJSON envelope. The version is read from `protocolVersion`.
    pub fn from_proto_json(value: &Value) -> Result<Self, EventError> {
        let object = value.as_object().ok_or_else(|| invalid("event must be a JSON object"))?;
        let protocol_version = match object.get("protocolVersion").and_then(Value::as_str) {
            Some(text) => ProtocolVersion::parse(text)
                .ok_or_else(|| invalid(format!("unsupported protocolVersion {text}")))?,
            None => return Err(invalid("event must have a protocolVersion")),
        };
        let mut present = PAYLOAD_KEYS.iter().filter(|key| object.contains_key(**key));
        let key = present.next().ok_or_else(|| invalid("event must have a payload"))?;
        if present.next().is_some() {
            return Err(invalid("event must have exactly one payload"));
        }
        let payload = EventPayload::payload_from_json(key, &object[*key])?;
        let event = EventEnvelope {
            event_id: string_field(object, "eventId")?,
            protocol_version,
            event_type: optional_string(object, "eventType")?,
            occurred_at: string_field(object, "occurredAt")?,
            source: optional_field(object, "source")?,
            actor: optional_field(object, "actor")?,
            recipient: optional_field(object, "recipient")?,
            channel: optional_field(object, "channel")?,
            conversation: optional_field(object, "conversation")?,
            correlation_id: string_field(object, "correlationId")?,
            causation_id: string_field(object, "causationId")?,
            idempotency_key: string_field(object, "idempotencyKey")?,
            extensions: optional_field(object, "extensions")?.unwrap_or_default(),
            payload,
        };
        event.validate()?;
        Ok(event)
    }

    /// Encodes as binary protobuf (`ocp.v1.api.EventEnvelope` for 0.1, `ocp.v2.api.EventEnvelope`
    /// for 0.2). Every payload kind has a protobuf encoding.
    pub fn to_binary(&self) -> Result<Vec<u8>, EventError> {
        self.validate()?;
        binary::encode_envelope(self)
    }

    /// Decodes binary protobuf. Binary has no version discriminator, so the expected
    /// `protocol_version` is required and must match the `protocol_version` field on the wire.
    pub fn from_binary(
        bytes: &[u8],
        protocol_version: ProtocolVersion,
    ) -> Result<Self, EventError> {
        let event = binary::decode_envelope(bytes, protocol_version)?;
        event.validate()?;
        Ok(event)
    }
}

/// Returns the event name for any envelope, derived from its payload for both versions.
pub fn event_type_of(event: &EventEnvelope) -> &'static str {
    event.payload.event_type()
}

fn envelope(protocol_version: ProtocolVersion, payload: EventPayload) -> EventEnvelope {
    EventEnvelope {
        event_id: Uuid::new_v4().to_string(),
        protocol_version,
        event_type: (protocol_version == ProtocolVersion::V0_1)
            .then(|| payload.event_type().to_owned()),
        occurred_at: now_rfc3339(),
        source: None,
        actor: None,
        recipient: None,
        channel: None,
        conversation: None,
        correlation_id: String::new(),
        causation_id: String::new(),
        idempotency_key: String::new(),
        extensions: BTreeMap::new(),
        payload,
    }
}

/// `message.received` for the requested protocol version.
pub fn message_received(
    protocol_version: ProtocolVersion,
    text: impl Into<String>,
) -> EventEnvelope {
    envelope(
        protocol_version,
        EventPayload::MessageReceived(MessageReceived {
            text: text.into(),
            ..MessageReceived::default()
        }),
    )
}

/// `message.sent` for the requested protocol version.
pub fn message_sent(protocol_version: ProtocolVersion, text: impl Into<String>) -> EventEnvelope {
    envelope(
        protocol_version,
        EventPayload::MessageSent(MessageSent { text: text.into(), ..MessageSent::default() }),
    )
}

/// `task.created` for the requested protocol version.
pub fn task_created(
    protocol_version: ProtocolVersion,
    task_id: impl Into<String>,
    intent: impl Into<String>,
    description: impl Into<String>,
    requested_by: &ActorRef,
) -> EventEnvelope {
    envelope(
        protocol_version,
        EventPayload::TaskCreated(TaskCreated {
            task_id: task_id.into(),
            intent: intent.into(),
            description: description.into(),
            requested_by: Some(requested_by.clone()),
        }),
    )
}

/// `task.assigned` for the requested protocol version.
pub fn task_assigned(
    protocol_version: ProtocolVersion,
    task_id: impl Into<String>,
    assignee: &ActorRef,
    reason: impl Into<String>,
) -> EventEnvelope {
    envelope(
        protocol_version,
        EventPayload::TaskAssigned(TaskAssigned {
            task_id: task_id.into(),
            assignee: Some(assignee.clone()),
            reason: reason.into(),
        }),
    )
}

/// `approval.requested` for the requested protocol version.
///
/// `deadline` is an RFC 3339 UTC timestamp, or `None` when the approval does not expire.
pub fn approval_requested(
    protocol_version: ProtocolVersion,
    requested_action: &ActionInvocation,
    approval_id: impl Into<String>,
    reason: impl Into<String>,
    agent: &ActorRef,
    approver: &ActorRef,
    deadline: Option<String>,
) -> EventEnvelope {
    envelope(
        protocol_version,
        EventPayload::ApprovalRequested(ApprovalRequested {
            approval_id: approval_id.into(),
            agent: Some(agent.clone()),
            requested_action: Some(requested_action.clone()),
            reason: reason.into(),
            approver: Some(approver.clone()),
            deadline,
        }),
    )
}

/// `approval.granted` or `approval.denied`, chosen by `outcome` (`Granted` or `Denied`).
pub fn approval_decided(
    protocol_version: ProtocolVersion,
    approval_id: impl Into<String>,
    outcome: ApprovalOutcome,
    approver: &ActorRef,
    reason: impl Into<String>,
) -> EventEnvelope {
    envelope(
        protocol_version,
        EventPayload::ApprovalDecided(ApprovalDecided {
            approval_id: approval_id.into(),
            approver: Some(approver.clone()),
            outcome,
            reason: reason.into(),
        }),
    )
}

/// `approval.expired` for the requested protocol version.
pub fn approval_expired(
    protocol_version: ProtocolVersion,
    approval_id: impl Into<String>,
    reason: impl Into<String>,
) -> EventEnvelope {
    envelope(
        protocol_version,
        EventPayload::ApprovalExpired(ApprovalExpired {
            approval_id: approval_id.into(),
            reason: reason.into(),
        }),
    )
}

/// `escalation.triggered` for the requested protocol version.
pub fn escalation_triggered(
    protocol_version: ProtocolVersion,
    escalation_id: impl Into<String>,
    source: &ActorRef,
    target: &ActorRef,
    reason: impl Into<String>,
    related_approval_id: impl Into<String>,
) -> EventEnvelope {
    envelope(
        protocol_version,
        EventPayload::EscalationTriggered(EscalationTriggered {
            escalation_id: escalation_id.into(),
            source: Some(source.clone()),
            target: Some(target.clone()),
            reason: reason.into(),
            related_approval_id: related_approval_id.into(),
        }),
    )
}

/// `handoff.initiated` for the requested protocol version.
pub fn handoff_initiated(
    protocol_version: ProtocolVersion,
    handoff_id: impl Into<String>,
    from: &ActorRef,
    to: &ActorRef,
    reason: impl Into<String>,
    open_questions: Vec<String>,
) -> EventEnvelope {
    envelope(
        protocol_version,
        EventPayload::HandoffInitiated(HandoffInitiated {
            handoff_id: handoff_id.into(),
            from: Some(from.clone()),
            to: Some(to.clone()),
            reason: reason.into(),
            open_questions,
        }),
    )
}

/// `handoff.completed` for the requested protocol version.
pub fn handoff_completed(
    protocol_version: ProtocolVersion,
    handoff_id: impl Into<String>,
    completed_by: &ActorRef,
    outcome: impl Into<String>,
) -> EventEnvelope {
    envelope(
        protocol_version,
        EventPayload::HandoffCompleted(HandoffCompleted {
            handoff_id: handoff_id.into(),
            completed_by: Some(completed_by.clone()),
            outcome: outcome.into(),
        }),
    )
}

/// `policy.allowed` or `policy.blocked`, chosen by `allowed`.
pub fn policy_evaluated(
    protocol_version: ProtocolVersion,
    allowed: bool,
    approval_required: bool,
    reason: impl Into<String>,
    action_type: impl Into<String>,
    recipient: &ActorRef,
    policy_id: impl Into<String>,
) -> EventEnvelope {
    envelope(
        protocol_version,
        EventPayload::PolicyEvaluated(PolicyEvaluated {
            policy_id: policy_id.into(),
            allowed,
            approval_required,
            reason: reason.into(),
            action_type: action_type.into(),
            recipient: Some(recipient.clone()),
        }),
    )
}

/// `action.executed` for the requested protocol version.
///
/// `result` is stored as a string. A JSON string is stored as-is; `null` becomes an empty string;
/// any other JSON value is stored as its JSON text.
pub fn action_executed(
    protocol_version: ProtocolVersion,
    action: &ActionInvocation,
    result: Value,
) -> EventEnvelope {
    envelope(
        protocol_version,
        EventPayload::ActionExecuted(ActionExecuted {
            action: Some(action.clone()),
            result: result_text(result),
            artifacts: Vec::new(),
        }),
    )
}

/// `action.failed` for the requested protocol version.
pub fn action_failed(
    protocol_version: ProtocolVersion,
    action: &ActionInvocation,
    error_code: impl Into<String>,
    error_message: impl Into<String>,
    retryable: bool,
) -> EventEnvelope {
    envelope(
        protocol_version,
        EventPayload::ActionFailed(ActionFailed {
            action: Some(action.clone()),
            error_code: error_code.into(),
            error_message: error_message.into(),
            retryable,
        }),
    )
}

fn result_text(result: Value) -> String {
    match result {
        Value::String(text) => text,
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn insert_text(object: &mut Map<String, Value>, key: &str, value: &str) {
    if !value.is_empty() {
        object.insert(key.to_owned(), Value::String(value.to_owned()));
    }
}

fn insert_optional<T: serde::Serialize>(
    object: &mut Map<String, Value>,
    key: &str,
    value: &Option<T>,
) -> Result<(), EventError> {
    if let Some(value) = value {
        object.insert(key.to_owned(), serde_json::to_value(value)?);
    }
    Ok(())
}

fn string_field(object: &Map<String, Value>, key: &str) -> Result<String, EventError> {
    Ok(optional_string(object, key)?.unwrap_or_default())
}

fn optional_string(object: &Map<String, Value>, key: &str) -> Result<Option<String>, EventError> {
    match object.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(text)) => Ok(Some(text.clone())),
        Some(_) => Err(invalid(format!("{key} must be a string"))),
    }
}

fn optional_field<T: DeserializeOwned>(
    object: &Map<String, Value>,
    key: &str,
) -> Result<Option<T>, EventError> {
    match object.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => Ok(Some(serde_json::from_value(value.clone())?)),
    }
}

/// Parses an RFC 3339 UTC timestamp (`...Z`, optional fractional seconds of up to nine digits)
/// into protobuf form, keeping the full nanosecond precision.
pub(crate) fn to_timestamp(value: &str) -> Result<prost_types::Timestamp, EventError> {
    let invalid_timestamp = || invalid(format!("timestamp must be RFC 3339 UTC: {value}"));
    let body = value.strip_suffix('Z').ok_or_else(invalid_timestamp)?;
    let (date_time, fraction) = body.split_once('.').unwrap_or((body, ""));
    if fraction.len() > 9 || !fraction.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(invalid_timestamp());
    }
    let (date, time) = date_time.split_once('T').ok_or_else(invalid_timestamp)?;
    let numbers = |text: &str| {
        text.split(['-', ':']).map(str::parse::<i64>).collect::<Result<Vec<_>, _>>().ok()
    };
    let (Some(date_parts), Some(time_parts)) = (numbers(date), numbers(time)) else {
        return Err(invalid_timestamp());
    };
    let (&[year, month, day], &[hour, minute, second]) =
        (date_parts.as_slice(), time_parts.as_slice())
    else {
        return Err(invalid_timestamp());
    };
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || !(0..24).contains(&hour)
        || !(0..60).contains(&minute)
        || !(0..60).contains(&second)
    {
        return Err(invalid_timestamp());
    }
    let days = days_from_civil(year, month, day);
    let nanos = if fraction.is_empty() {
        0
    } else {
        format!("{fraction:0<9}").parse::<i32>().map_err(|_| invalid_timestamp())?
    };
    Ok(prost_types::Timestamp {
        seconds: days * 86_400 + hour * 3_600 + minute * 60 + second,
        nanos,
    })
}

/// Formats a protobuf timestamp as RFC 3339 UTC. Fractional digits follow the ProtoJSON rule:
/// none for whole seconds, otherwise 3, 6, or 9 digits, whichever is exact.
pub(crate) fn from_timestamp(
    timestamp: Option<prost_types::Timestamp>,
) -> Result<String, EventError> {
    let timestamp = timestamp.ok_or_else(|| invalid("timestamp is required"))?;
    if !(0..1_000_000_000).contains(&timestamp.nanos) {
        return Err(invalid(format!("timestamp nanos out of range: {}", timestamp.nanos)));
    }
    Ok(format_rfc3339(timestamp.seconds, timestamp.nanos as u32))
}

fn now_rfc3339() -> String {
    let elapsed = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    format_rfc3339(elapsed.as_secs() as i64, elapsed.subsec_nanos())
}

fn format_rfc3339(seconds: i64, nanos: u32) -> String {
    let (year, month, day) = civil_from_days(seconds.div_euclid(86_400));
    let day_seconds = seconds.rem_euclid(86_400);
    let fraction = if nanos == 0 {
        String::new()
    } else if nanos.is_multiple_of(1_000_000) {
        format!(".{:03}", nanos / 1_000_000)
    } else if nanos.is_multiple_of(1_000) {
        format!(".{:06}", nanos / 1_000)
    } else {
        format!(".{nanos:09}")
    };
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}{fraction}Z",
        day_seconds / 3_600,
        (day_seconds % 3_600) / 60,
        day_seconds % 60
    )
}

fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let shifted_days = days_since_epoch + 719_468;
    let era =
        if shifted_days >= 0 { shifted_days / 146_097 } else { (shifted_days - 146_096) / 146_097 };
    let day_of_era = shifted_days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_part = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_part + 2) / 5 + 1;
    let month = month_part + if month_part < 10 { 3 } else { -9 };
    let year = year + if month <= 2 { 1 } else { 0 };
    (year, month, day)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month_index = (month + 9) % 12;
    let day_of_year = (153 * month_index + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

#[cfg(test)]
mod tests {
    use prost::Message as _;

    use super::*;
    use crate::generated::ocp::{
        v1::api::EventEnvelope as V1Envelope, v2::api::EventEnvelope as V2Envelope,
    };
    use crate::models::{ActorType, ArtifactRef};

    fn action() -> ActionInvocation {
        ActionInvocation {
            action_id: "action:1".to_owned(),
            input: serde_json::json!({ "amount": 10 }),
            action_type: "refund".to_owned(),
            ..ActionInvocation::default()
        }
    }

    fn sample_actor() -> ActorRef {
        ActorRef {
            id: "human:gabriel".to_owned(),
            actor_type: ActorType::Human,
            display_name: "Gabriel".to_owned(),
            authority: "frontal".to_owned(),
            capabilities: vec!["approve".to_owned()],
        }
    }

    fn sample_message(version: ProtocolVersion) -> EventEnvelope {
        let mut event = message_received(version, "hello");
        event.actor = Some(sample_actor());
        event.recipient = Some(ActorRef::agent("agent:support", "Support"));
        event.channel = Some(ChannelRef {
            provider: "slack".to_owned(),
            channel_id: "C1".to_owned(),
            thread_id: "T1".to_owned(),
            address: "#support".to_owned(),
        });
        event.conversation = Some(ConversationRef {
            id: "conv:1".to_owned(),
            status: "CONVERSATION_STATUS_OPEN".to_owned(),
            participants: vec![sample_actor()],
        });
        event.correlation_id = "corr:1".to_owned();
        event.extensions.insert("tenant".to_owned(), "acme".to_owned());
        event.payload = EventPayload::MessageReceived(MessageReceived {
            text: "hello".to_owned(),
            attachments: vec![ArtifactRef {
                id: "art:1".to_owned(),
                uri: "https://example.test/a.pdf".to_owned(),
                title: "A".to_owned(),
                media_type: "application/pdf".to_owned(),
                source_of_truth: "drive".to_owned(),
            }],
            metadata: BTreeMap::from([("locale".to_owned(), "en".to_owned())]),
        });
        event
    }

    #[test]
    fn typed_builder_round_trips_without_a_duplicate_event_type() {
        let event = message_received(ProtocolVersion::V0_2, "hello");
        let json = event.to_proto_json().expect("event serializes");
        assert_eq!(event_type_of(&event), "message.received");
        assert!(json.get("eventType").is_none());
        assert_eq!(json["protocolVersion"], "0.2");
        assert!(json.get("messageReceived").is_some());
        assert_eq!(EventEnvelope::from_proto_json(&json).expect("event parses"), event);
    }

    #[test]
    fn v01_builders_store_event_type_and_derive_it_from_payload() {
        let agent = ActorRef::agent("agent:support", "Support");
        let cases = [
            (message_received(ProtocolVersion::V0_1, "hi"), "message.received"),
            (message_sent(ProtocolVersion::V0_1, "hi"), "message.sent"),
            (
                approval_requested(
                    ProtocolVersion::V0_1,
                    &action(),
                    "approval:1",
                    "over limit",
                    &agent,
                    &sample_actor(),
                    None,
                ),
                "approval.requested",
            ),
            (action_executed(ProtocolVersion::V0_1, &action(), Value::Null), "action.executed"),
            (
                action_failed(ProtocolVersion::V0_1, &action(), "OCP_ACTION", "boom", false),
                "action.failed",
            ),
        ];
        for (event, expected) in cases {
            assert_eq!(event_type_of(&event), expected);
            assert_eq!(event.event_type.as_deref(), Some(expected));
            let json = event.to_proto_json().expect("v0.1 serializes");
            assert_eq!(json["eventType"], expected);
            assert_eq!(json["protocolVersion"], "0.1");
        }
    }

    #[test]
    fn v02_builders_derive_event_type_from_payload() {
        let agent = ActorRef::agent("agent:support", "Support");
        let cases = [
            (message_sent(ProtocolVersion::V0_2, "hi"), "message.sent"),
            (
                approval_requested(
                    ProtocolVersion::V0_2,
                    &action(),
                    "approval:1",
                    "over limit",
                    &agent,
                    &sample_actor(),
                    None,
                ),
                "approval.requested",
            ),
            (action_executed(ProtocolVersion::V0_2, &action(), Value::Null), "action.executed"),
            (
                action_failed(ProtocolVersion::V0_2, &action(), "OCP_ACTION", "boom", true),
                "action.failed",
            ),
        ];
        for (event, expected) in cases {
            assert_eq!(event.event_type, None);
            assert_eq!(event_type_of(&event), expected);
            let json = event.to_proto_json().expect("v0.2 serializes");
            assert!(json.get("eventType").is_none());
            assert_eq!(json["protocolVersion"], "0.2");
        }
    }

    #[test]
    fn approval_and_policy_names_derive_from_outcome_and_allowed() {
        let approver = sample_actor();
        let granted = approval_decided(
            ProtocolVersion::V0_2,
            "a:1",
            ApprovalOutcome::Granted,
            &approver,
            "ok",
        );
        let denied = approval_decided(
            ProtocolVersion::V0_2,
            "a:1",
            ApprovalOutcome::Denied,
            &approver,
            "no",
        );
        let agent = ActorRef::agent("agent:support", "Support");
        let blocked = policy_evaluated(
            ProtocolVersion::V0_2,
            false,
            true,
            "over limit",
            "refund",
            &agent,
            "policy:1",
        );
        let allowed = policy_evaluated(
            ProtocolVersion::V0_2,
            true,
            false,
            "within limit",
            "refund",
            &agent,
            "policy:1",
        );
        assert_eq!(event_type_of(&granted), "approval.granted");
        assert_eq!(event_type_of(&denied), "approval.denied");
        assert_eq!(event_type_of(&blocked), "policy.blocked");
        assert_eq!(event_type_of(&allowed), "policy.allowed");
    }

    #[test]
    fn mismatched_name_is_rejected_for_both_versions() {
        for version in [ProtocolVersion::V0_1, ProtocolVersion::V0_2] {
            let payload = EventPayload::MessageReceived(MessageReceived::default());
            assert!(matches!(
                EventEnvelope::with_event_type(version, "message.sent", payload),
                Err(EventError::Invalid(_))
            ));
        }
        let denied = EventPayload::ApprovalDecided(ApprovalDecided {
            approval_id: "a:1".to_owned(),
            outcome: ApprovalOutcome::Denied,
            ..ApprovalDecided::default()
        });
        assert!(matches!(
            EventEnvelope::with_event_type(ProtocolVersion::V0_2, "approval.granted", denied),
            Err(EventError::Invalid(_))
        ));
    }

    #[test]
    fn version_and_shape_mismatch_is_rejected() {
        let mut v02_with_name = message_received(ProtocolVersion::V0_2, "hi");
        v02_with_name.event_type = Some("message.received".to_owned());
        assert!(matches!(v02_with_name.validate(), Err(EventError::Invalid(_))));

        let mut v01_without_name = message_received(ProtocolVersion::V0_1, "hi");
        v01_without_name.event_type = None;
        assert!(matches!(v01_without_name.validate(), Err(EventError::Invalid(_))));

        let json = serde_json::json!({
            "eventId": "e:1",
            "protocolVersion": "0.2",
            "eventType": "message.received",
            "occurredAt": "2026-10-19T10:00:00.000Z",
            "messageReceived": { "text": "hi" }
        });
        assert!(matches!(EventEnvelope::from_proto_json(&json), Err(EventError::Invalid(_))));

        let unknown_version = serde_json::json!({
            "eventId": "e:1",
            "protocolVersion": "0.3",
            "occurredAt": "2026-10-19T10:00:00.000Z",
            "messageReceived": { "text": "hi" }
        });
        assert!(matches!(
            EventEnvelope::from_proto_json(&unknown_version),
            Err(EventError::Invalid(_))
        ));
    }

    #[test]
    fn approval_and_policy_invariants_are_enforced() {
        let mut bad_outcome = approval_decided(
            ProtocolVersion::V0_2,
            "a:1",
            ApprovalOutcome::Granted,
            &sample_actor(),
            "ok",
        );
        bad_outcome.payload = EventPayload::ApprovalDecided(ApprovalDecided {
            approval_id: "a:1".to_owned(),
            outcome: ApprovalOutcome::Expired,
            ..ApprovalDecided::default()
        });
        assert!(matches!(bad_outcome.validate(), Err(EventError::Invalid(_))));

        let mut missing_id = approval_requested(
            ProtocolVersion::V0_2,
            &action(),
            "a:1",
            "why",
            &ActorRef::agent("agent:support", "Support"),
            &sample_actor(),
            None,
        );
        missing_id.payload = EventPayload::ApprovalRequested(ApprovalRequested {
            approval_id: " ".to_owned(),
            requested_action: Some(action()),
            ..ApprovalRequested::default()
        });
        assert!(matches!(missing_id.validate(), Err(EventError::Invalid(_))));

        let mut missing_action = missing_id.clone();
        missing_action.payload = EventPayload::ApprovalRequested(ApprovalRequested {
            approval_id: "a:1".to_owned(),
            ..ApprovalRequested::default()
        });
        assert!(matches!(missing_action.validate(), Err(EventError::Invalid(_))));
    }

    #[test]
    fn json_round_trips_both_versions() {
        for version in [ProtocolVersion::V0_1, ProtocolVersion::V0_2] {
            let event = sample_message(version);
            let json = event.to_proto_json().expect("serializes");
            assert_eq!(json["protocolVersion"], version.as_str());
            assert_eq!(EventEnvelope::from_proto_json(&json).expect("parses"), event);
        }
    }

    #[test]
    fn action_input_travels_as_a_json_string_parameter() {
        let event = action_executed(ProtocolVersion::V0_2, &action(), Value::Null);
        let json = event.to_proto_json().expect("serializes");
        let request = &json["actionExecuted"]["action"];
        assert_eq!(request["actionId"], "action:1");
        assert_eq!(request["type"], "refund");
        assert_eq!(request["parameters"]["input"], r#"{"amount":10}"#);
        assert!(request.get("input").is_none());

        let parsed = EventEnvelope::from_proto_json(&json).expect("parses");
        let EventPayload::ActionExecuted(payload) = parsed.payload else {
            panic!("expected action.executed");
        };
        assert_eq!(payload.action.expect("action present").input, action().input);
    }

    #[test]
    fn timestamps_keep_source_precision() {
        let whole = to_timestamp("2026-01-01T00:00:00Z").expect("parses");
        assert_eq!((whole.seconds, whole.nanos), (1_767_225_600, 0));
        let millis = to_timestamp("2026-01-01T00:00:00.123Z").expect("parses");
        assert_eq!((millis.seconds, millis.nanos), (1_767_225_600, 123_000_000));
        assert_eq!(from_timestamp(Some(millis)).expect("formats"), "2026-01-01T00:00:00.123Z");
        let nanos = to_timestamp("2026-01-01T00:00:00.000000789Z").expect("parses");
        assert_eq!(from_timestamp(Some(nanos)).expect("formats"), "2026-01-01T00:00:00.000000789Z");
        assert!(to_timestamp("2026-01-01T00:00:00.1234567891Z").is_err());
    }

    #[test]
    fn binary_round_trips_both_versions_as_real_protobuf() {
        for version in [ProtocolVersion::V0_1, ProtocolVersion::V0_2] {
            let event = sample_message(version);
            let bytes = event.to_binary().expect("encodes");
            let decoded = EventEnvelope::from_binary(&bytes, version).expect("decodes");
            assert_eq!(decoded, event);
        }

        let v1_bytes = sample_message(ProtocolVersion::V0_1).to_binary().expect("encodes");
        let as_v1 = V1Envelope::decode(v1_bytes.as_slice()).expect("plain protobuf");
        assert_eq!(as_v1.event_type, "message.received");
        assert_eq!(as_v1.protocol_version, "0.1");
        let v2_bytes = sample_message(ProtocolVersion::V0_2).to_binary().expect("encodes");
        let as_v2 = V2Envelope::decode(v2_bytes.as_slice()).expect("plain protobuf");
        assert_eq!(as_v2.protocol_version, "0.2");
    }

    #[test]
    fn binary_requires_matching_version() {
        let bytes = sample_message(ProtocolVersion::V0_1).to_binary().expect("encodes");
        assert!(EventEnvelope::from_binary(&bytes, ProtocolVersion::V0_2).is_err());
    }

    #[test]
    fn every_payload_kind_round_trips_in_binary_for_both_versions() {
        let agent = ActorRef::agent("agent:support", "Support");
        let human = sample_actor();
        let deadline = Some("2030-01-01T00:00:00Z".to_owned());
        let payloads = vec![
            EventPayload::TaskCreated(TaskCreated {
                task_id: "task:1".to_owned(),
                intent: "support".to_owned(),
                description: "Follow up".to_owned(),
                requested_by: Some(human.clone()),
            }),
            EventPayload::TaskAssigned(TaskAssigned {
                task_id: "task:1".to_owned(),
                assignee: Some(agent.clone()),
                reason: "queue".to_owned(),
            }),
            EventPayload::ApprovalRequested(ApprovalRequested {
                approval_id: "approval:1".to_owned(),
                agent: Some(agent.clone()),
                requested_action: Some(action()),
                reason: "over limit".to_owned(),
                approver: Some(human.clone()),
                deadline,
            }),
            EventPayload::ApprovalExpired(ApprovalExpired {
                approval_id: "approval:1".to_owned(),
                reason: "timed out".to_owned(),
            }),
            EventPayload::EscalationTriggered(EscalationTriggered {
                escalation_id: "esc:1".to_owned(),
                source: Some(agent.clone()),
                target: Some(human.clone()),
                reason: "no response".to_owned(),
                related_approval_id: "approval:1".to_owned(),
            }),
            EventPayload::HandoffInitiated(HandoffInitiated {
                handoff_id: "handoff:1".to_owned(),
                from: Some(agent.clone()),
                to: Some(human.clone()),
                reason: "needs a person".to_owned(),
                open_questions: vec!["q1".to_owned(), "q2".to_owned()],
            }),
            EventPayload::HandoffCompleted(HandoffCompleted {
                handoff_id: "handoff:1".to_owned(),
                completed_by: Some(human.clone()),
                outcome: "resolved".to_owned(),
            }),
            EventPayload::PolicyEvaluated(PolicyEvaluated {
                policy_id: "policy:1".to_owned(),
                allowed: false,
                approval_required: true,
                reason: "over limit".to_owned(),
                action_type: "refund".to_owned(),
                recipient: Some(agent.clone()),
            }),
            EventPayload::ActionExecuted(ActionExecuted {
                action: Some(action()),
                result: r#"{"ok":true}"#.to_owned(),
                artifacts: Vec::new(),
            }),
            EventPayload::ActionFailed(ActionFailed {
                action: Some(action()),
                error_code: "PROVIDER_DOWN".to_owned(),
                error_message: "provider unavailable".to_owned(),
                retryable: true,
            }),
        ];
        for version in [ProtocolVersion::V0_1, ProtocolVersion::V0_2] {
            for payload in &payloads {
                let mut event = envelope(version, payload.clone());
                event.occurred_at = "2026-01-01T00:00:00.123Z".to_owned();
                let bytes = event.to_binary().expect("encodes");
                let decoded = EventEnvelope::from_binary(&bytes, version).expect("decodes");
                assert_eq!(decoded, event, "{}", event_type_of(&event));
            }
        }
    }

    #[test]
    fn approval_expired_and_decided_builders_name_correctly() {
        let approver = sample_actor();
        let expired = approval_expired(ProtocolVersion::V0_2, "approval:1", "timed out");
        assert_eq!(event_type_of(&expired), "approval.expired");
        let denied = approval_decided(
            ProtocolVersion::V0_1,
            "approval:1",
            ApprovalOutcome::Denied,
            &approver,
            "not allowed",
        );
        assert_eq!(denied.event_type.as_deref(), Some("approval.denied"));
        assert!(denied.to_binary().is_ok());
    }
}
