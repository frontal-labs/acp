use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{ActionInvocation, ActorRef, MessageReceived, MessageSent};

pub const ACP_V2_PROTOCOL_VERSION: &str = "0.2";

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub enum V2EventPayload {
    #[serde(rename = "messageReceived")]
    MessageReceived(MessageReceived),
    #[serde(rename = "messageSent")]
    MessageSent(MessageSent),
    #[serde(rename = "approvalRequested")]
    ApprovalRequested(serde_json::Value),
    #[serde(rename = "actionExecuted")]
    ActionExecuted(serde_json::Value),
    #[serde(rename = "actionFailed")]
    ActionFailed(serde_json::Value),
}

impl V2EventPayload {
    pub fn event_type(&self) -> &'static str {
        match self {
            Self::MessageReceived(_) => "message.received",
            Self::MessageSent(_) => "message.sent",
            Self::ApprovalRequested(_) => "approval.requested",
            Self::ActionExecuted(_) => "action.executed",
            Self::ActionFailed(_) => "action.failed",
        }
    }

    fn to_json(&self) -> (String, serde_json::Value) {
        match self {
            Self::MessageReceived(value) => {
                ("messageReceived".to_owned(), serde_json::to_value(value).unwrap_or_default())
            }
            Self::MessageSent(value) => {
                ("messageSent".to_owned(), serde_json::to_value(value).unwrap_or_default())
            }
            Self::ApprovalRequested(value) => ("approvalRequested".to_owned(), value.clone()),
            Self::ActionExecuted(value) => ("actionExecuted".to_owned(), value.clone()),
            Self::ActionFailed(value) => ("actionFailed".to_owned(), value.clone()),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct V2EventEnvelope {
    pub event_id: String,
    pub protocol_version: String,
    pub occurred_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<ActorRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor: Option<ActorRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recipient: Option<ActorRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<crate::ChannelRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conversation: Option<crate::ConversationRef>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub correlation_id: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub causation_id: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub idempotency_key: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub extensions: BTreeMap<String, String>,
    pub payload: V2EventPayload,
}

impl V2EventEnvelope {
    pub fn event_type(&self) -> &'static str {
        self.payload.event_type()
    }

    pub fn to_proto_json(&self) -> Result<serde_json::Value, serde_json::Error> {
        let mut value = serde_json::Map::new();
        value.insert("eventId".to_owned(), serde_json::Value::String(self.event_id.clone()));
        value.insert(
            "protocolVersion".to_owned(),
            serde_json::Value::String(self.protocol_version.clone()),
        );
        value.insert("occurredAt".to_owned(), serde_json::Value::String(self.occurred_at.clone()));
        if let Some(actor) = &self.source {
            value.insert("source".to_owned(), serde_json::to_value(actor)?);
        }
        if let Some(actor) = &self.actor {
            value.insert("actor".to_owned(), serde_json::to_value(actor)?);
        }
        if let Some(actor) = &self.recipient {
            value.insert("recipient".to_owned(), serde_json::to_value(actor)?);
        }
        if let Some(channel) = &self.channel {
            value.insert("channel".to_owned(), serde_json::to_value(channel)?);
        }
        if let Some(conversation) = &self.conversation {
            value.insert("conversation".to_owned(), serde_json::to_value(conversation)?);
        }
        if !self.correlation_id.is_empty() {
            value.insert(
                "correlationId".to_owned(),
                serde_json::Value::String(self.correlation_id.clone()),
            );
        }
        if !self.causation_id.is_empty() {
            value.insert(
                "causationId".to_owned(),
                serde_json::Value::String(self.causation_id.clone()),
            );
        }
        if !self.idempotency_key.is_empty() {
            value.insert(
                "idempotencyKey".to_owned(),
                serde_json::Value::String(self.idempotency_key.clone()),
            );
        }
        if !self.extensions.is_empty() {
            value.insert("extensions".to_owned(), serde_json::to_value(&self.extensions)?);
        }
        let (key, payload) = self.payload.to_json();
        value.insert(key, payload);
        Ok(serde_json::Value::Object(value))
    }
}

fn envelope(payload: V2EventPayload) -> V2EventEnvelope {
    V2EventEnvelope {
        event_id: Uuid::new_v4().to_string(),
        protocol_version: ACP_V2_PROTOCOL_VERSION.to_owned(),
        occurred_at: super::models::now_rfc3339(),
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

pub fn message_received(text: impl Into<String>) -> V2EventEnvelope {
    envelope(V2EventPayload::MessageReceived(MessageReceived {
        text: text.into(),
        ..MessageReceived::default()
    }))
}

pub fn message_sent(text: impl Into<String>) -> V2EventEnvelope {
    envelope(V2EventPayload::MessageSent(MessageSent {
        text: text.into(),
        ..MessageSent::default()
    }))
}

pub fn approval_requested(
    requested_action: &ActionInvocation,
    approval_id: impl Into<String>,
    reason: impl Into<String>,
) -> V2EventEnvelope {
    envelope(V2EventPayload::ApprovalRequested(serde_json::json!({
        "approvalId": approval_id.into(),
        "reason": reason.into(),
        "requestedAction": requested_action,
    })))
}

pub fn action_executed(action: &ActionInvocation, result: serde_json::Value) -> V2EventEnvelope {
    envelope(V2EventPayload::ActionExecuted(
        serde_json::json!({ "action": action, "result": result }),
    ))
}

pub fn action_failed(
    action: &ActionInvocation,
    error_code: impl Into<String>,
    error_message: impl Into<String>,
    retryable: bool,
) -> V2EventEnvelope {
    envelope(V2EventPayload::ActionFailed(serde_json::json!({
        "action": action,
        "errorCode": error_code.into(),
        "errorMessage": error_message.into(),
        "retryable": retryable,
    })))
}

pub fn event_to_json(event: &V2EventEnvelope) -> Result<serde_json::Value, serde_json::Error> {
    event.to_proto_json()
}

pub fn event_to_binary(event: &V2EventEnvelope) -> Result<Vec<u8>, serde_json::Error> {
    let mut bytes = b"ACP2\n".to_vec();
    bytes.extend(serde_json::to_vec(&event.to_proto_json()?)?);
    Ok(bytes)
}

pub fn parse_event(value: &[u8]) -> Result<V2EventEnvelope, serde_json::Error> {
    let bytes = value.strip_prefix(b"ACP2\n").unwrap_or(value);
    let json: serde_json::Value = serde_json::from_slice(bytes)?;
    let object = json.as_object().cloned().unwrap_or_default();
    let payload = if let Some(value) = object.get("messageReceived") {
        V2EventPayload::MessageReceived(serde_json::from_value(value.clone())?)
    } else if let Some(value) = object.get("messageSent") {
        V2EventPayload::MessageSent(serde_json::from_value(value.clone())?)
    } else if let Some(value) = object.get("approvalRequested") {
        V2EventPayload::ApprovalRequested(value.clone())
    } else if let Some(value) = object.get("actionExecuted") {
        V2EventPayload::ActionExecuted(value.clone())
    } else if let Some(value) = object.get("actionFailed") {
        V2EventPayload::ActionFailed(value.clone())
    } else {
        return Err(serde_json::from_str("null").expect_err("null cannot decode envelope"));
    };
    Ok(V2EventEnvelope {
        event_id: object
            .get("eventId")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        protocol_version: object
            .get("protocolVersion")
            .and_then(serde_json::Value::as_str)
            .unwrap_or(ACP_V2_PROTOCOL_VERSION)
            .to_owned(),
        occurred_at: object
            .get("occurredAt")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        source: object.get("source").cloned().map(serde_json::from_value).transpose()?,
        actor: object.get("actor").cloned().map(serde_json::from_value).transpose()?,
        recipient: object.get("recipient").cloned().map(serde_json::from_value).transpose()?,
        channel: object.get("channel").cloned().map(serde_json::from_value).transpose()?,
        conversation: object
            .get("conversation")
            .cloned()
            .map(serde_json::from_value)
            .transpose()?,
        correlation_id: object
            .get("correlationId")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        causation_id: object
            .get("causationId")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        idempotency_key: object
            .get("idempotencyKey")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        extensions: object
            .get("extensions")
            .cloned()
            .map(serde_json::from_value)
            .transpose()?
            .unwrap_or_default(),
        payload,
    })
}
