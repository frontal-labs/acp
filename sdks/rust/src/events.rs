//! OCP event envelopes. There is one envelope and one protocol version, [`PROTOCOL_VERSION`].
//!
//! The payload oneof is the event kind: [`EventEnvelope::event_type`] derives the dot-separated
//! name (for example `approval.granted`) from it, so the envelope never stores a second copy.
//! Binary protobuf is encoded by prost (see `binary.rs`); the ProtoJSON form uses serde.
//! Mirrors `packages/protocol/src/events.ts`, `builders.ts`, and `serialization.ts`.

use std::collections::BTreeMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
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

/// The protocol version carried by every envelope.
pub const PROTOCOL_VERSION: &str = "0.2";

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

    /// Deserializes straight from the borrowed JSON value; no intermediate clone.
    fn payload_from_json(key: &str, value: &Value) -> Result<Self, EventError> {
        Ok(match key {
            "messageReceived" => Self::MessageReceived(Deserialize::deserialize(value)?),
            "messageSent" => Self::MessageSent(Deserialize::deserialize(value)?),
            "taskCreated" => Self::TaskCreated(Deserialize::deserialize(value)?),
            "taskAssigned" => Self::TaskAssigned(Deserialize::deserialize(value)?),
            "approvalRequested" => Self::ApprovalRequested(Deserialize::deserialize(value)?),
            "approvalDecided" => Self::ApprovalDecided(Deserialize::deserialize(value)?),
            "approvalExpired" => Self::ApprovalExpired(Deserialize::deserialize(value)?),
            "escalationTriggered" => Self::EscalationTriggered(Deserialize::deserialize(value)?),
            "handoffInitiated" => Self::HandoffInitiated(Deserialize::deserialize(value)?),
            "handoffCompleted" => Self::HandoffCompleted(Deserialize::deserialize(value)?),
            "policyEvaluated" => Self::PolicyEvaluated(Deserialize::deserialize(value)?),
            "actionExecuted" => Self::ActionExecuted(Deserialize::deserialize(value)?),
            "actionFailed" => Self::ActionFailed(Deserialize::deserialize(value)?),
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

/// An OCP event envelope.
///
/// Use [`EventEnvelope::new`] or a typed builder such as [`message_received`] to create one.
/// [`EventEnvelope::validate`] runs before every JSON and binary encode and after every decode.
#[derive(Clone, Debug, PartialEq)]
pub struct EventEnvelope {
    pub event_id: String,
    /// RFC 3339 UTC timestamp. Fractional seconds keep millisecond, microsecond, or nanosecond
    /// precision, whichever the source provides.
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
    /// Builds an envelope with a fresh event ID and the current time.
    pub fn new(payload: EventPayload) -> Self {
        Self {
            event_id: Uuid::new_v4().to_string(),
            occurred_at: system_time_to_rfc3339(SystemTime::now()),
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

    /// The dot-separated event name, derived from the payload (for example `approval.granted`).
    pub fn event_type(&self) -> &'static str {
        self.payload.event_type()
    }

    /// The message payload, when this is a `message.received` event.
    pub fn as_message_received(&self) -> Option<&MessageReceived> {
        match &self.payload {
            EventPayload::MessageReceived(message) => Some(message),
            _ => None,
        }
    }

    /// Checks the event ID, timestamp, and payload invariants.
    pub fn validate(&self) -> Result<(), EventError> {
        if self.event_id.trim().is_empty() {
            return Err(invalid("event_id is required"));
        }
        if self.occurred_at.trim().is_empty() {
            return Err(invalid("occurred_at is required"));
        }
        self.payload.validate()
    }

    /// Serializes to ProtoJSON, with the payload under its oneof key.
    pub fn to_json(&self) -> Result<Value, EventError> {
        self.validate()?;
        let mut object = Map::new();
        object.insert("eventId".to_owned(), Value::String(self.event_id.clone()));
        object.insert("protocolVersion".to_owned(), Value::String(PROTOCOL_VERSION.to_owned()));
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

    /// Parses and validates an untrusted ProtoJSON envelope.
    pub fn from_json(value: &Value) -> Result<Self, EventError> {
        let object = value.as_object().ok_or_else(|| invalid("event must be a JSON object"))?;
        match object.get("protocolVersion").and_then(Value::as_str) {
            Some(PROTOCOL_VERSION) => {}
            Some(text) => {
                return Err(invalid(format!(
                    "unsupported protocolVersion {text}; expected {PROTOCOL_VERSION}"
                )))
            }
            None => return Err(invalid("event must have a protocolVersion")),
        }
        let mut present = PAYLOAD_KEYS.iter().filter(|key| object.contains_key(**key));
        let key = present.next().ok_or_else(|| invalid("event must have a payload"))?;
        if present.next().is_some() {
            return Err(invalid("event must have exactly one payload"));
        }
        let event = EventEnvelope {
            event_id: string_field(object, "eventId")?,
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
            payload: EventPayload::payload_from_json(key, &object[*key])?,
        };
        event.validate()?;
        Ok(event)
    }

    /// Encodes as binary protobuf (`ocp.api.EventEnvelope`).
    pub fn to_binary(&self) -> Result<Vec<u8>, EventError> {
        self.validate()?;
        binary::encode(self)
    }

    /// Decodes and validates binary protobuf (`ocp.api.EventEnvelope`).
    pub fn from_binary(bytes: &[u8]) -> Result<Self, EventError> {
        let event = binary::decode(bytes)?;
        event.validate()?;
        Ok(event)
    }
}

fn envelope(payload: EventPayload) -> EventEnvelope {
    EventEnvelope::new(payload)
}

/// `message.received`.
pub fn message_received(text: impl Into<String>) -> EventEnvelope {
    envelope(EventPayload::MessageReceived(MessageReceived {
        text: text.into(),
        ..MessageReceived::default()
    }))
}

/// `message.sent`.
pub fn message_sent(text: impl Into<String>) -> EventEnvelope {
    envelope(EventPayload::MessageSent(MessageSent { text: text.into(), ..MessageSent::default() }))
}

/// `task.created`.
pub fn task_created(
    task_id: impl Into<String>,
    intent: impl Into<String>,
    description: impl Into<String>,
    requested_by: &ActorRef,
) -> EventEnvelope {
    envelope(EventPayload::TaskCreated(TaskCreated {
        task_id: task_id.into(),
        intent: intent.into(),
        description: description.into(),
        requested_by: Some(requested_by.clone()),
    }))
}

/// `task.assigned`.
pub fn task_assigned(
    task_id: impl Into<String>,
    assignee: &ActorRef,
    reason: impl Into<String>,
) -> EventEnvelope {
    envelope(EventPayload::TaskAssigned(TaskAssigned {
        task_id: task_id.into(),
        assignee: Some(assignee.clone()),
        reason: reason.into(),
    }))
}

/// `approval.requested`.
///
/// `deadline` is an RFC 3339 UTC timestamp, or `None` when the approval does not expire.
pub fn approval_requested(
    requested_action: &ActionInvocation,
    approval_id: impl Into<String>,
    reason: impl Into<String>,
    agent: &ActorRef,
    approver: &ActorRef,
    deadline: Option<String>,
) -> EventEnvelope {
    envelope(EventPayload::ApprovalRequested(ApprovalRequested {
        approval_id: approval_id.into(),
        agent: Some(agent.clone()),
        requested_action: Some(requested_action.clone()),
        reason: reason.into(),
        approver: Some(approver.clone()),
        deadline,
    }))
}

/// `approval.granted` or `approval.denied`, chosen by `outcome` (`Granted` or `Denied`).
pub fn approval_decided(
    approval_id: impl Into<String>,
    outcome: ApprovalOutcome,
    approver: &ActorRef,
    reason: impl Into<String>,
) -> EventEnvelope {
    envelope(EventPayload::ApprovalDecided(ApprovalDecided {
        approval_id: approval_id.into(),
        approver: Some(approver.clone()),
        outcome,
        reason: reason.into(),
    }))
}

/// `approval.expired`.
pub fn approval_expired(
    approval_id: impl Into<String>,
    reason: impl Into<String>,
) -> EventEnvelope {
    envelope(EventPayload::ApprovalExpired(ApprovalExpired {
        approval_id: approval_id.into(),
        reason: reason.into(),
    }))
}

/// `escalation.triggered`.
pub fn escalation_triggered(
    escalation_id: impl Into<String>,
    source: &ActorRef,
    target: &ActorRef,
    reason: impl Into<String>,
    related_approval_id: impl Into<String>,
) -> EventEnvelope {
    envelope(EventPayload::EscalationTriggered(EscalationTriggered {
        escalation_id: escalation_id.into(),
        source: Some(source.clone()),
        target: Some(target.clone()),
        reason: reason.into(),
        related_approval_id: related_approval_id.into(),
    }))
}

/// `handoff.initiated`.
pub fn handoff_initiated(
    handoff_id: impl Into<String>,
    from: &ActorRef,
    to: &ActorRef,
    reason: impl Into<String>,
    open_questions: Vec<String>,
) -> EventEnvelope {
    envelope(EventPayload::HandoffInitiated(HandoffInitiated {
        handoff_id: handoff_id.into(),
        from: Some(from.clone()),
        to: Some(to.clone()),
        reason: reason.into(),
        open_questions,
    }))
}

/// `handoff.completed`.
pub fn handoff_completed(
    handoff_id: impl Into<String>,
    completed_by: &ActorRef,
    outcome: impl Into<String>,
) -> EventEnvelope {
    envelope(EventPayload::HandoffCompleted(HandoffCompleted {
        handoff_id: handoff_id.into(),
        completed_by: Some(completed_by.clone()),
        outcome: outcome.into(),
    }))
}

/// `policy.allowed` or `policy.blocked`, chosen by `allowed`.
pub fn policy_evaluated(
    allowed: bool,
    approval_required: bool,
    reason: impl Into<String>,
    action_type: impl Into<String>,
    recipient: &ActorRef,
    policy_id: impl Into<String>,
) -> EventEnvelope {
    envelope(EventPayload::PolicyEvaluated(PolicyEvaluated {
        policy_id: policy_id.into(),
        allowed,
        approval_required,
        reason: reason.into(),
        action_type: action_type.into(),
        recipient: Some(recipient.clone()),
    }))
}

/// `action.executed`.
///
/// `result` is stored as a string. A JSON string is stored as-is; `null` becomes an empty string;
/// any other JSON value is stored as its JSON text.
pub fn action_executed(action: &ActionInvocation, result: Value) -> EventEnvelope {
    envelope(EventPayload::ActionExecuted(ActionExecuted {
        action: Some(action.clone()),
        result: result_text(result),
        artifacts: Vec::new(),
    }))
}

/// `action.failed`.
pub fn action_failed(
    action: &ActionInvocation,
    error_code: impl Into<String>,
    error_message: impl Into<String>,
    retryable: bool,
) -> EventEnvelope {
    envelope(EventPayload::ActionFailed(ActionFailed {
        action: Some(action.clone()),
        error_code: error_code.into(),
        error_message: error_message.into(),
        retryable,
    }))
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

fn optional_field<T: for<'de> Deserialize<'de>>(
    object: &Map<String, Value>,
    key: &str,
) -> Result<Option<T>, EventError> {
    match object.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => Ok(Some(Deserialize::deserialize(value)?)),
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

/// RFC 3339 UTC text for a point in time, at the precision the value has.
pub(crate) fn system_time_to_rfc3339(time: SystemTime) -> String {
    let elapsed = time.duration_since(UNIX_EPOCH).unwrap_or_default();
    format_rfc3339(elapsed.as_secs() as i64, elapsed.subsec_nanos())
}

/// Parses RFC 3339 UTC text into a point in time.
pub(crate) fn rfc3339_to_system_time(value: &str) -> Result<SystemTime, EventError> {
    let timestamp = to_timestamp(value)?;
    let seconds = u64::try_from(timestamp.seconds)
        .map_err(|_| invalid(format!("timestamp before 1970: {value}")))?;
    let nanos =
        u32::try_from(timestamp.nanos).map_err(|_| invalid("timestamp nanos out of range"))?;
    Ok(UNIX_EPOCH + Duration::new(seconds, nanos))
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
    use super::*;
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

    fn sample_message() -> EventEnvelope {
        let mut event = message_received("hello");
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
    fn builder_derives_event_type_and_json_round_trips() {
        let event = message_received("hello");
        assert_eq!(event.event_type(), "message.received");
        let json = event.to_json().expect("serializes");
        assert!(json.get("eventType").is_none());
        assert_eq!(json["protocolVersion"], PROTOCOL_VERSION);
        assert!(json.get("messageReceived").is_some());
        assert_eq!(EventEnvelope::from_json(&json).expect("parses"), event);
    }

    #[test]
    fn every_builder_names_its_event_from_the_payload() {
        let agent = ActorRef::agent("agent:support", "Support");
        let cases = [
            (message_sent("hi"), "message.sent"),
            (message_received("hi"), "message.received"),
            (
                approval_requested(
                    &action(),
                    "approval:1",
                    "over limit",
                    &agent,
                    &sample_actor(),
                    None,
                ),
                "approval.requested",
            ),
            (action_executed(&action(), Value::Null), "action.executed"),
            (action_failed(&action(), "OCP_ACTION", "boom", true), "action.failed"),
            (approval_expired("approval:1", "timed out"), "approval.expired"),
        ];
        for (event, expected) in cases {
            assert_eq!(event.event_type(), expected);
            let json = event.to_json().expect("serializes");
            assert!(json.get("eventType").is_none());
            assert_eq!(json["protocolVersion"], PROTOCOL_VERSION);
        }
    }

    #[test]
    fn approval_and_policy_names_derive_from_outcome_and_allowed() {
        let approver = sample_actor();
        let agent = ActorRef::agent("agent:support", "Support");
        let granted = approval_decided("a:1", ApprovalOutcome::Granted, &approver, "ok");
        let denied = approval_decided("a:1", ApprovalOutcome::Denied, &approver, "no");
        let blocked = policy_evaluated(false, true, "over limit", "refund", &agent, "policy:1");
        let allowed = policy_evaluated(true, false, "within limit", "refund", &agent, "policy:1");
        assert_eq!(granted.event_type(), "approval.granted");
        assert_eq!(denied.event_type(), "approval.denied");
        assert_eq!(blocked.event_type(), "policy.blocked");
        assert_eq!(allowed.event_type(), "policy.allowed");
    }

    #[test]
    fn json_rejects_other_versions_and_multiple_payloads() {
        let other_version = serde_json::json!({
            "eventId": "e:1",
            "protocolVersion": "0.1",
            "occurredAt": "2026-10-19T10:00:00.000Z",
            "messageReceived": { "text": "hi" }
        });
        assert!(matches!(EventEnvelope::from_json(&other_version), Err(EventError::Invalid(_))));

        let two_payloads = serde_json::json!({
            "eventId": "e:1",
            "protocolVersion": PROTOCOL_VERSION,
            "occurredAt": "2026-10-19T10:00:00.000Z",
            "messageReceived": { "text": "hi" },
            "messageSent": { "text": "hi" }
        });
        assert!(matches!(EventEnvelope::from_json(&two_payloads), Err(EventError::Invalid(_))));
    }

    #[test]
    fn approval_and_action_invariants_are_enforced() {
        let mut bad_outcome =
            approval_decided("a:1", ApprovalOutcome::Granted, &sample_actor(), "ok");
        bad_outcome.payload = EventPayload::ApprovalDecided(ApprovalDecided {
            approval_id: "a:1".to_owned(),
            outcome: ApprovalOutcome::Expired,
            ..ApprovalDecided::default()
        });
        assert!(matches!(bad_outcome.validate(), Err(EventError::Invalid(_))));

        let mut missing_id = approval_requested(
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

        let mut missing_event_id = message_received("hi");
        missing_event_id.event_id.clear();
        assert!(matches!(missing_event_id.validate(), Err(EventError::Invalid(_))));
    }

    #[test]
    fn action_input_travels_as_a_json_string_parameter() {
        let event = action_executed(&action(), Value::Null);
        let json = event.to_json().expect("serializes");
        let request = &json["actionExecuted"]["action"];
        assert_eq!(request["actionId"], "action:1");
        assert_eq!(request["type"], "refund");
        assert_eq!(request["parameters"]["input"], r#"{"amount":10}"#);
        assert!(request.get("input").is_none());

        let parsed = EventEnvelope::from_json(&json).expect("parses");
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
    fn binary_round_trips() {
        let event = sample_message();
        let bytes = event.to_binary().expect("encodes");
        assert_eq!(EventEnvelope::from_binary(&bytes).expect("decodes"), event);
    }

    #[test]
    fn every_payload_kind_round_trips_in_binary_and_json() {
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
        for payload in payloads {
            let mut event = EventEnvelope::new(payload);
            event.occurred_at = "2026-01-01T00:00:00.123Z".to_owned();
            let bytes = event.to_binary().expect("encodes");
            assert_eq!(EventEnvelope::from_binary(&bytes).expect("decodes"), event);
            let json = event.to_json().expect("serializes");
            assert_eq!(EventEnvelope::from_json(&json).expect("parses"), event);
        }
    }
}
