//! Binary protobuf codec: maps the domain envelope onto the prost types generated from
//! `proto/v1` and `proto/v2`. Nothing here is hand-encoded; prost does the wire format.
//!
//! Both protocol versions share the payload messages in `acp.v1.types`; only the envelope and its
//! oneof differ (`acp.v1.api.EventEnvelope` stores `event_type`, `acp.v2.api.EventEnvelope` does
//! not).

use std::collections::BTreeMap;

use prost::Message;

use crate::events::{
    from_timestamp, invalid, to_timestamp, EventEnvelope, EventError, EventPayload, ProtocolVersion,
};
use crate::generated::acp::{v1, v2};
use crate::models::ActionRequestJson;
use crate::models::{
    ActionInvocation, ActorRef, ActorType, ArtifactRef, ChannelRef, ConversationRef,
    MessageReceived, MessageSent,
};
use crate::payloads::{
    ActionExecuted, ActionFailed, ApprovalDecided, ApprovalExpired, ApprovalOutcome,
    ApprovalRequested, EscalationTriggered, HandoffCompleted, HandoffInitiated, PolicyEvaluated,
    TaskAssigned, TaskCreated,
};

type V1Envelope = v1::api::EventEnvelope;
type V2Envelope = v2::api::EventEnvelope;
type V1Oneof = v1::api::event_envelope::Payload;
type V2Oneof = v2::api::event_envelope::Payload;

/// Proto-side payload, shared by both envelope versions.
pub(crate) enum ProtoPayload {
    MessageReceived(v1::types::MessageReceived),
    MessageSent(v1::types::MessageSent),
    TaskCreated(v1::types::TaskCreated),
    TaskAssigned(v1::types::TaskAssigned),
    ApprovalRequested(v1::types::ApprovalRequested),
    ApprovalDecided(v1::types::ApprovalDecided),
    ApprovalExpired(v1::types::ApprovalExpired),
    EscalationTriggered(v1::types::EscalationTriggered),
    HandoffInitiated(v1::types::HandoffInitiated),
    HandoffCompleted(v1::types::HandoffCompleted),
    PolicyEvaluated(v1::types::PolicyEvaluated),
    ActionExecuted(v1::types::ActionExecuted),
    ActionFailed(v1::types::ActionFailed),
}

macro_rules! to_oneof {
    ($payload:expr, $oneof:ident) => {
        match $payload {
            ProtoPayload::MessageReceived(v) => $oneof::MessageReceived(v),
            ProtoPayload::MessageSent(v) => $oneof::MessageSent(v),
            ProtoPayload::TaskCreated(v) => $oneof::TaskCreated(v),
            ProtoPayload::TaskAssigned(v) => $oneof::TaskAssigned(v),
            ProtoPayload::ApprovalRequested(v) => $oneof::ApprovalRequested(v),
            ProtoPayload::ApprovalDecided(v) => $oneof::ApprovalDecided(v),
            ProtoPayload::ApprovalExpired(v) => $oneof::ApprovalExpired(v),
            ProtoPayload::EscalationTriggered(v) => $oneof::EscalationTriggered(v),
            ProtoPayload::HandoffInitiated(v) => $oneof::HandoffInitiated(v),
            ProtoPayload::HandoffCompleted(v) => $oneof::HandoffCompleted(v),
            ProtoPayload::PolicyEvaluated(v) => $oneof::PolicyEvaluated(v),
            ProtoPayload::ActionExecuted(v) => $oneof::ActionExecuted(v),
            ProtoPayload::ActionFailed(v) => $oneof::ActionFailed(v),
        }
    };
}

macro_rules! from_oneof {
    ($value:expr, $oneof:ident) => {
        match $value {
            $oneof::MessageReceived(v) => ProtoPayload::MessageReceived(v),
            $oneof::MessageSent(v) => ProtoPayload::MessageSent(v),
            $oneof::TaskCreated(v) => ProtoPayload::TaskCreated(v),
            $oneof::TaskAssigned(v) => ProtoPayload::TaskAssigned(v),
            $oneof::ApprovalRequested(v) => ProtoPayload::ApprovalRequested(v),
            $oneof::ApprovalDecided(v) => ProtoPayload::ApprovalDecided(v),
            $oneof::ApprovalExpired(v) => ProtoPayload::ApprovalExpired(v),
            $oneof::EscalationTriggered(v) => ProtoPayload::EscalationTriggered(v),
            $oneof::HandoffInitiated(v) => ProtoPayload::HandoffInitiated(v),
            $oneof::HandoffCompleted(v) => ProtoPayload::HandoffCompleted(v),
            $oneof::PolicyEvaluated(v) => ProtoPayload::PolicyEvaluated(v),
            $oneof::ActionExecuted(v) => ProtoPayload::ActionExecuted(v),
            $oneof::ActionFailed(v) => ProtoPayload::ActionFailed(v),
        }
    };
}

/// Encodes the envelope as `acp.v1.api.EventEnvelope` (0.1) or `acp.v2.api.EventEnvelope` (0.2).
pub(crate) fn encode_envelope(event: &EventEnvelope) -> Result<Vec<u8>, EventError> {
    let payload = payload_to_proto(&event.payload)?;
    let source = event.source.as_ref().map(actor_to_proto);
    let actor = event.actor.as_ref().map(actor_to_proto);
    let recipient = event.recipient.as_ref().map(actor_to_proto);
    let channel = event.channel.as_ref().map(channel_to_proto);
    let conversation = event.conversation.as_ref().map(conversation_to_proto).transpose()?;
    let occurred_at = Some(to_timestamp(&event.occurred_at)?);
    let extensions: BTreeMap<String, String> =
        event.extensions.iter().map(|(key, value)| (key.clone(), value.clone())).collect();
    let bytes = match event.protocol_version {
        ProtocolVersion::V0_1 => V1Envelope {
            event_id: event.event_id.clone(),
            event_type: event.event_type.clone().unwrap_or_default(),
            protocol_version: event.protocol_version.as_str().to_owned(),
            occurred_at,
            source,
            actor,
            recipient,
            channel,
            conversation,
            correlation_id: event.correlation_id.clone(),
            causation_id: event.causation_id.clone(),
            idempotency_key: event.idempotency_key.clone(),
            extensions,
            payload: Some(to_oneof!(payload, V1Oneof)),
        }
        .encode_to_vec(),
        ProtocolVersion::V0_2 => V2Envelope {
            event_id: event.event_id.clone(),
            protocol_version: event.protocol_version.as_str().to_owned(),
            occurred_at,
            source,
            actor,
            recipient,
            channel,
            conversation,
            correlation_id: event.correlation_id.clone(),
            causation_id: event.causation_id.clone(),
            idempotency_key: event.idempotency_key.clone(),
            extensions,
            payload: Some(to_oneof!(payload, V2Oneof)),
        }
        .encode_to_vec(),
    };
    Ok(bytes)
}

/// Decodes binary protobuf for the expected version. The bytes carry no version discriminator
/// beyond the `protocol_version` field, which must match `protocol_version`.
pub(crate) fn decode_envelope(
    bytes: &[u8],
    protocol_version: ProtocolVersion,
) -> Result<EventEnvelope, EventError> {
    let event = match protocol_version {
        ProtocolVersion::V0_1 => {
            let message = V1Envelope::decode(bytes)?;
            check_wire_version(&message.protocol_version, protocol_version)?;
            let payload = message
                .payload
                .map(|payload| from_oneof!(payload, V1Oneof))
                .ok_or_else(|| invalid("event must have a payload"))?;
            EventEnvelope {
                event_id: message.event_id,
                protocol_version,
                event_type: Some(message.event_type),
                occurred_at: from_timestamp(message.occurred_at)?,
                source: opt_actor_from_proto(message.source)?,
                actor: opt_actor_from_proto(message.actor)?,
                recipient: opt_actor_from_proto(message.recipient)?,
                channel: message.channel.map(channel_from_proto),
                conversation: message.conversation.map(conversation_from_proto).transpose()?,
                correlation_id: message.correlation_id,
                causation_id: message.causation_id,
                idempotency_key: message.idempotency_key,
                extensions: message.extensions.into_iter().collect(),
                payload: payload_from_proto(payload)?,
            }
        }
        ProtocolVersion::V0_2 => {
            let message = V2Envelope::decode(bytes)?;
            check_wire_version(&message.protocol_version, protocol_version)?;
            let payload = message
                .payload
                .map(|payload| from_oneof!(payload, V2Oneof))
                .ok_or_else(|| invalid("event must have a payload"))?;
            EventEnvelope {
                event_id: message.event_id,
                protocol_version,
                event_type: None,
                occurred_at: from_timestamp(message.occurred_at)?,
                source: opt_actor_from_proto(message.source)?,
                actor: opt_actor_from_proto(message.actor)?,
                recipient: opt_actor_from_proto(message.recipient)?,
                channel: message.channel.map(channel_from_proto),
                conversation: message.conversation.map(conversation_from_proto).transpose()?,
                correlation_id: message.correlation_id,
                causation_id: message.causation_id,
                idempotency_key: message.idempotency_key,
                extensions: message.extensions.into_iter().collect(),
                payload: payload_from_proto(payload)?,
            }
        }
    };
    Ok(event)
}

fn check_wire_version(wire: &str, expected: ProtocolVersion) -> Result<(), EventError> {
    match ProtocolVersion::parse(wire) {
        Some(version) if version == expected => Ok(()),
        _ => Err(invalid(format!(
            "binary envelope declares protocol_version {wire:?} but was decoded as {expected}"
        ))),
    }
}

fn payload_to_proto(payload: &EventPayload) -> Result<ProtoPayload, EventError> {
    Ok(match payload {
        EventPayload::MessageReceived(message) => {
            ProtoPayload::MessageReceived(v1::types::MessageReceived {
                text: message.text.clone(),
                attachments: message.attachments.iter().map(artifact_to_proto).collect(),
                metadata: message.metadata.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
            })
        }
        EventPayload::MessageSent(message) => ProtoPayload::MessageSent(v1::types::MessageSent {
            text: message.text.clone(),
            attachments: message.attachments.iter().map(artifact_to_proto).collect(),
            metadata: message.metadata.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        }),
        EventPayload::TaskCreated(payload) => ProtoPayload::TaskCreated(v1::types::TaskCreated {
            task_id: payload.task_id.clone(),
            intent: payload.intent.clone(),
            description: payload.description.clone(),
            requested_by: opt_actor_to_proto(&payload.requested_by),
        }),
        EventPayload::TaskAssigned(payload) => {
            ProtoPayload::TaskAssigned(v1::types::TaskAssigned {
                task_id: payload.task_id.clone(),
                assignee: opt_actor_to_proto(&payload.assignee),
                reason: payload.reason.clone(),
            })
        }
        EventPayload::ApprovalRequested(payload) => {
            ProtoPayload::ApprovalRequested(v1::types::ApprovalRequested {
                approval_id: payload.approval_id.clone(),
                agent: opt_actor_to_proto(&payload.agent),
                requested_action: payload.requested_action.as_ref().map(action_to_proto),
                reason: payload.reason.clone(),
                approver: opt_actor_to_proto(&payload.approver),
                deadline: payload.deadline.as_deref().map(to_timestamp).transpose()?,
            })
        }
        EventPayload::ApprovalDecided(payload) => {
            ProtoPayload::ApprovalDecided(v1::types::ApprovalDecided {
                approval_id: payload.approval_id.clone(),
                approver: opt_actor_to_proto(&payload.approver),
                outcome: approval_outcome_to_proto(payload.outcome) as i32,
                reason: payload.reason.clone(),
            })
        }
        EventPayload::ApprovalExpired(payload) => {
            ProtoPayload::ApprovalExpired(v1::types::ApprovalExpired {
                approval_id: payload.approval_id.clone(),
                reason: payload.reason.clone(),
            })
        }
        EventPayload::EscalationTriggered(payload) => {
            ProtoPayload::EscalationTriggered(v1::types::EscalationTriggered {
                escalation_id: payload.escalation_id.clone(),
                source: opt_actor_to_proto(&payload.source),
                target: opt_actor_to_proto(&payload.target),
                reason: payload.reason.clone(),
                related_approval_id: payload.related_approval_id.clone(),
            })
        }
        EventPayload::HandoffInitiated(payload) => {
            ProtoPayload::HandoffInitiated(v1::types::HandoffInitiated {
                handoff_id: payload.handoff_id.clone(),
                from: opt_actor_to_proto(&payload.from),
                to: opt_actor_to_proto(&payload.to),
                reason: payload.reason.clone(),
                open_questions: payload.open_questions.clone(),
            })
        }
        EventPayload::HandoffCompleted(payload) => {
            ProtoPayload::HandoffCompleted(v1::types::HandoffCompleted {
                handoff_id: payload.handoff_id.clone(),
                completed_by: opt_actor_to_proto(&payload.completed_by),
                outcome: payload.outcome.clone(),
            })
        }
        EventPayload::PolicyEvaluated(payload) => {
            ProtoPayload::PolicyEvaluated(v1::types::PolicyEvaluated {
                policy_id: payload.policy_id.clone(),
                allowed: payload.allowed,
                approval_required: payload.approval_required,
                reason: payload.reason.clone(),
                action_type: payload.action_type.clone(),
                recipient: opt_actor_to_proto(&payload.recipient),
            })
        }
        EventPayload::ActionExecuted(payload) => {
            ProtoPayload::ActionExecuted(v1::types::ActionExecuted {
                action: payload.action.as_ref().map(action_to_proto),
                result: payload.result.clone(),
                artifacts: payload.artifacts.iter().map(artifact_to_proto).collect(),
            })
        }
        EventPayload::ActionFailed(payload) => {
            ProtoPayload::ActionFailed(v1::types::ActionFailed {
                action: payload.action.as_ref().map(action_to_proto),
                error_code: payload.error_code.clone(),
                error_message: payload.error_message.clone(),
                retryable: payload.retryable,
            })
        }
    })
}

fn payload_from_proto(payload: ProtoPayload) -> Result<EventPayload, EventError> {
    Ok(match payload {
        ProtoPayload::MessageReceived(message) => EventPayload::MessageReceived(MessageReceived {
            text: message.text,
            attachments: message.attachments.into_iter().map(artifact_from_proto).collect(),
            metadata: message.metadata.into_iter().collect(),
        }),
        ProtoPayload::MessageSent(message) => EventPayload::MessageSent(MessageSent {
            text: message.text,
            attachments: message.attachments.into_iter().map(artifact_from_proto).collect(),
            metadata: message.metadata.into_iter().collect(),
        }),
        ProtoPayload::TaskCreated(payload) => EventPayload::TaskCreated(TaskCreated {
            task_id: payload.task_id,
            intent: payload.intent,
            description: payload.description,
            requested_by: opt_actor_from_proto(payload.requested_by)?,
        }),
        ProtoPayload::TaskAssigned(payload) => EventPayload::TaskAssigned(TaskAssigned {
            task_id: payload.task_id,
            assignee: opt_actor_from_proto(payload.assignee)?,
            reason: payload.reason,
        }),
        ProtoPayload::ApprovalRequested(payload) => {
            EventPayload::ApprovalRequested(ApprovalRequested {
                approval_id: payload.approval_id,
                agent: opt_actor_from_proto(payload.agent)?,
                requested_action: payload.requested_action.map(action_from_proto).transpose()?,
                reason: payload.reason,
                approver: opt_actor_from_proto(payload.approver)?,
                deadline: payload.deadline.map(timestamp_string).transpose()?,
            })
        }
        ProtoPayload::ApprovalDecided(payload) => EventPayload::ApprovalDecided(ApprovalDecided {
            approval_id: payload.approval_id,
            approver: opt_actor_from_proto(payload.approver)?,
            outcome: approval_outcome_from_proto(payload.outcome)?,
            reason: payload.reason,
        }),
        ProtoPayload::ApprovalExpired(payload) => EventPayload::ApprovalExpired(ApprovalExpired {
            approval_id: payload.approval_id,
            reason: payload.reason,
        }),
        ProtoPayload::EscalationTriggered(payload) => {
            EventPayload::EscalationTriggered(EscalationTriggered {
                escalation_id: payload.escalation_id,
                source: opt_actor_from_proto(payload.source)?,
                target: opt_actor_from_proto(payload.target)?,
                reason: payload.reason,
                related_approval_id: payload.related_approval_id,
            })
        }
        ProtoPayload::HandoffInitiated(payload) => {
            EventPayload::HandoffInitiated(HandoffInitiated {
                handoff_id: payload.handoff_id,
                from: opt_actor_from_proto(payload.from)?,
                to: opt_actor_from_proto(payload.to)?,
                reason: payload.reason,
                open_questions: payload.open_questions,
            })
        }
        ProtoPayload::HandoffCompleted(payload) => {
            EventPayload::HandoffCompleted(HandoffCompleted {
                handoff_id: payload.handoff_id,
                completed_by: opt_actor_from_proto(payload.completed_by)?,
                outcome: payload.outcome,
            })
        }
        ProtoPayload::PolicyEvaluated(payload) => EventPayload::PolicyEvaluated(PolicyEvaluated {
            policy_id: payload.policy_id,
            allowed: payload.allowed,
            approval_required: payload.approval_required,
            reason: payload.reason,
            action_type: payload.action_type,
            recipient: opt_actor_from_proto(payload.recipient)?,
        }),
        ProtoPayload::ActionExecuted(payload) => EventPayload::ActionExecuted(ActionExecuted {
            action: payload.action.map(action_from_proto).transpose()?,
            result: payload.result,
            artifacts: payload.artifacts.into_iter().map(artifact_from_proto).collect(),
        }),
        ProtoPayload::ActionFailed(payload) => EventPayload::ActionFailed(ActionFailed {
            action: payload.action.map(action_from_proto).transpose()?,
            error_code: payload.error_code,
            error_message: payload.error_message,
            retryable: payload.retryable,
        }),
    })
}

fn action_to_proto(action: &ActionInvocation) -> v1::types::ActionRequest {
    let json = ActionRequestJson::from(action.clone());
    v1::types::ActionRequest {
        action_id: json.action_id,
        r#type: json.action_type,
        target: json.target,
        parameters: json.parameters.into_iter().collect::<BTreeMap<_, _>>(),
    }
}

fn action_from_proto(request: v1::types::ActionRequest) -> Result<ActionInvocation, EventError> {
    let json = ActionRequestJson {
        action_id: request.action_id,
        action_type: request.r#type,
        target: request.target,
        parameters: request.parameters.into_iter().collect::<BTreeMap<_, _>>(),
    };
    ActionInvocation::try_from(json).map_err(invalid)
}

const APPROVAL_OUTCOMES: [(v1::types::ApprovalOutcome, ApprovalOutcome); 4] = [
    (v1::types::ApprovalOutcome::Unspecified, ApprovalOutcome::Unspecified),
    (v1::types::ApprovalOutcome::Granted, ApprovalOutcome::Granted),
    (v1::types::ApprovalOutcome::Denied, ApprovalOutcome::Denied),
    (v1::types::ApprovalOutcome::Expired, ApprovalOutcome::Expired),
];

fn approval_outcome_to_proto(outcome: ApprovalOutcome) -> v1::types::ApprovalOutcome {
    APPROVAL_OUTCOMES
        .iter()
        .find(|(_, domain)| *domain == outcome)
        .map(|(proto, _)| *proto)
        .unwrap_or(v1::types::ApprovalOutcome::Unspecified)
}

fn approval_outcome_from_proto(value: i32) -> Result<ApprovalOutcome, EventError> {
    APPROVAL_OUTCOMES
        .iter()
        .find(|(proto, _)| *proto as i32 == value)
        .map(|(_, domain)| *domain)
        .ok_or_else(|| invalid(format!("unknown approval outcome {value}")))
}

fn timestamp_string(timestamp: prost_types::Timestamp) -> Result<String, EventError> {
    from_timestamp(Some(timestamp))
}

fn artifact_to_proto(artifact: &ArtifactRef) -> v1::types::ArtifactRef {
    v1::types::ArtifactRef {
        id: artifact.id.clone(),
        uri: artifact.uri.clone(),
        title: artifact.title.clone(),
        media_type: artifact.media_type.clone(),
        source_of_truth: artifact.source_of_truth.clone(),
    }
}

fn artifact_from_proto(artifact: v1::types::ArtifactRef) -> ArtifactRef {
    ArtifactRef {
        id: artifact.id,
        uri: artifact.uri,
        title: artifact.title,
        media_type: artifact.media_type,
        source_of_truth: artifact.source_of_truth,
    }
}

fn opt_actor_to_proto(actor: &Option<ActorRef>) -> Option<v1::types::ActorRef> {
    actor.as_ref().map(actor_to_proto)
}

fn opt_actor_from_proto(
    actor: Option<v1::types::ActorRef>,
) -> Result<Option<ActorRef>, EventError> {
    actor.map(actor_from_proto).transpose()
}

fn actor_to_proto(actor: &ActorRef) -> v1::types::ActorRef {
    let actor_type = match actor.actor_type {
        ActorType::Unspecified => v1::types::ActorType::Unspecified,
        ActorType::Human => v1::types::ActorType::Human,
        ActorType::Agent => v1::types::ActorType::Agent,
        ActorType::System => v1::types::ActorType::System,
    };
    v1::types::ActorRef {
        id: actor.id.clone(),
        r#type: actor_type as i32,
        display_name: actor.display_name.clone(),
        authority: actor.authority.clone(),
        capabilities: actor.capabilities.clone(),
    }
}

fn actor_from_proto(actor: v1::types::ActorRef) -> Result<ActorRef, EventError> {
    let actor_type = [
        v1::types::ActorType::Unspecified,
        v1::types::ActorType::Human,
        v1::types::ActorType::Agent,
        v1::types::ActorType::System,
    ]
    .into_iter()
    .find(|candidate| *candidate as i32 == actor.r#type)
    .ok_or_else(|| invalid(format!("unknown actor type {}", actor.r#type)))?;
    Ok(ActorRef {
        id: actor.id,
        actor_type: match actor_type {
            v1::types::ActorType::Unspecified => ActorType::Unspecified,
            v1::types::ActorType::Human => ActorType::Human,
            v1::types::ActorType::Agent => ActorType::Agent,
            v1::types::ActorType::System => ActorType::System,
        },
        display_name: actor.display_name,
        authority: actor.authority,
        capabilities: actor.capabilities,
    })
}

fn channel_to_proto(channel: &ChannelRef) -> v1::types::ChannelRef {
    v1::types::ChannelRef {
        provider: channel.provider.clone(),
        channel_id: channel.channel_id.clone(),
        thread_id: channel.thread_id.clone(),
        address: channel.address.clone(),
    }
}

fn channel_from_proto(channel: v1::types::ChannelRef) -> ChannelRef {
    ChannelRef {
        provider: channel.provider,
        channel_id: channel.channel_id,
        thread_id: channel.thread_id,
        address: channel.address,
    }
}

fn conversation_to_proto(
    conversation: &ConversationRef,
) -> Result<v1::types::ConversationRef, EventError> {
    let status = if conversation.status.is_empty() {
        v1::types::ConversationStatus::Unspecified as i32
    } else {
        v1::types::ConversationStatus::from_str_name(&conversation.status).ok_or_else(|| {
            invalid(format!("unknown conversation status {}", conversation.status))
        })? as i32
    };
    Ok(v1::types::ConversationRef {
        id: conversation.id.clone(),
        status,
        participants: conversation.participants.iter().map(actor_to_proto).collect(),
    })
}

fn conversation_from_proto(
    conversation: v1::types::ConversationRef,
) -> Result<ConversationRef, EventError> {
    let status = [
        v1::types::ConversationStatus::Unspecified,
        v1::types::ConversationStatus::Open,
        v1::types::ConversationStatus::Paused,
        v1::types::ConversationStatus::Closed,
    ]
    .into_iter()
    .find(|candidate| *candidate as i32 == conversation.status)
    .ok_or_else(|| invalid(format!("unknown conversation status {}", conversation.status)))?;
    let status = if status == v1::types::ConversationStatus::Unspecified {
        String::new()
    } else {
        status.as_str_name().to_owned()
    };
    Ok(ConversationRef {
        id: conversation.id,
        status,
        participants: conversation
            .participants
            .into_iter()
            .map(actor_from_proto)
            .collect::<Result<_, _>>()?,
    })
}
