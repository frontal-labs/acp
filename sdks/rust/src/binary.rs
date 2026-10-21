//! Binary protobuf codec: maps the domain envelope onto the prost types generated from
//! `proto/ocp`. Nothing here is hand-encoded; prost does the wire format.

use std::collections::BTreeMap;

use prost::Message;

use crate::events::{
    from_timestamp, invalid, to_timestamp, EventEnvelope, EventError, EventPayload,
    PROTOCOL_VERSION,
};
use crate::generated::ocp::{api, types};
use crate::models::{
    ActionInvocation, ActionRequestJson, ActorRef, ActorType, ArtifactRef, ChannelRef,
    ConversationRef, MessageReceived, MessageSent,
};
use crate::payloads::{
    ActionExecuted, ActionFailed, ApprovalDecided, ApprovalExpired, ApprovalOutcome,
    ApprovalRequested, EscalationTriggered, HandoffCompleted, HandoffInitiated, PolicyEvaluated,
    TaskAssigned, TaskCreated,
};

type Envelope = api::EventEnvelope;

/// Encodes the envelope as `ocp.api.EventEnvelope`.
pub(crate) fn encode(event: &EventEnvelope) -> Result<Vec<u8>, EventError> {
    Ok(Envelope {
        event_id: event.event_id.clone(),
        protocol_version: PROTOCOL_VERSION.to_owned(),
        occurred_at: Some(to_timestamp(&event.occurred_at)?),
        source: event.source.as_ref().map(actor_to_proto),
        actor: event.actor.as_ref().map(actor_to_proto),
        recipient: event.recipient.as_ref().map(actor_to_proto),
        channel: event.channel.as_ref().map(channel_to_proto),
        conversation: event.conversation.as_ref().map(conversation_to_proto).transpose()?,
        correlation_id: event.correlation_id.clone(),
        causation_id: event.causation_id.clone(),
        idempotency_key: event.idempotency_key.clone(),
        extensions: event.extensions.clone(),
        payload: Some(payload_to_proto(&event.payload)?),
    }
    .encode_to_vec())
}

/// Decodes `ocp.api.EventEnvelope`, rejecting any other protocol version.
pub(crate) fn decode(bytes: &[u8]) -> Result<EventEnvelope, EventError> {
    let message = Envelope::decode(bytes)?;
    if message.protocol_version != PROTOCOL_VERSION {
        return Err(invalid(format!(
            "binary envelope declares protocol_version {:?}, expected {PROTOCOL_VERSION}",
            message.protocol_version
        )));
    }
    let payload = message.payload.ok_or_else(|| invalid("event must have a payload"))?;
    Ok(EventEnvelope {
        event_id: message.event_id,
        occurred_at: from_timestamp(message.occurred_at)?,
        source: opt_actor_from_proto(message.source)?,
        actor: opt_actor_from_proto(message.actor)?,
        recipient: opt_actor_from_proto(message.recipient)?,
        channel: message.channel.map(channel_from_proto),
        conversation: message.conversation.map(conversation_from_proto).transpose()?,
        correlation_id: message.correlation_id,
        causation_id: message.causation_id,
        idempotency_key: message.idempotency_key,
        extensions: message.extensions,
        payload: payload_from_proto(payload)?,
    })
}

type Oneof = api::event_envelope::Payload;

fn payload_to_proto(payload: &EventPayload) -> Result<Oneof, EventError> {
    Ok(match payload {
        EventPayload::MessageReceived(message) => Oneof::MessageReceived(types::MessageReceived {
            text: message.text.clone(),
            attachments: message.attachments.iter().map(artifact_to_proto).collect(),
            metadata: message.metadata.clone(),
        }),
        EventPayload::MessageSent(message) => Oneof::MessageSent(types::MessageSent {
            text: message.text.clone(),
            attachments: message.attachments.iter().map(artifact_to_proto).collect(),
            metadata: message.metadata.clone(),
        }),
        EventPayload::TaskCreated(payload) => Oneof::TaskCreated(types::TaskCreated {
            task_id: payload.task_id.clone(),
            intent: payload.intent.clone(),
            description: payload.description.clone(),
            requested_by: opt_actor_to_proto(&payload.requested_by),
        }),
        EventPayload::TaskAssigned(payload) => Oneof::TaskAssigned(types::TaskAssigned {
            task_id: payload.task_id.clone(),
            assignee: opt_actor_to_proto(&payload.assignee),
            reason: payload.reason.clone(),
        }),
        EventPayload::ApprovalRequested(payload) => {
            Oneof::ApprovalRequested(types::ApprovalRequested {
                approval_id: payload.approval_id.clone(),
                agent: opt_actor_to_proto(&payload.agent),
                requested_action: payload.requested_action.as_ref().map(action_to_proto),
                reason: payload.reason.clone(),
                approver: opt_actor_to_proto(&payload.approver),
                deadline: payload.deadline.as_deref().map(to_timestamp).transpose()?,
            })
        }
        EventPayload::ApprovalDecided(payload) => Oneof::ApprovalDecided(types::ApprovalDecided {
            approval_id: payload.approval_id.clone(),
            approver: opt_actor_to_proto(&payload.approver),
            outcome: approval_outcome_to_proto(payload.outcome) as i32,
            reason: payload.reason.clone(),
        }),
        EventPayload::ApprovalExpired(payload) => Oneof::ApprovalExpired(types::ApprovalExpired {
            approval_id: payload.approval_id.clone(),
            reason: payload.reason.clone(),
        }),
        EventPayload::EscalationTriggered(payload) => {
            Oneof::EscalationTriggered(types::EscalationTriggered {
                escalation_id: payload.escalation_id.clone(),
                source: opt_actor_to_proto(&payload.source),
                target: opt_actor_to_proto(&payload.target),
                reason: payload.reason.clone(),
                related_approval_id: payload.related_approval_id.clone(),
            })
        }
        EventPayload::HandoffInitiated(payload) => {
            Oneof::HandoffInitiated(types::HandoffInitiated {
                handoff_id: payload.handoff_id.clone(),
                from: opt_actor_to_proto(&payload.from),
                to: opt_actor_to_proto(&payload.to),
                reason: payload.reason.clone(),
                open_questions: payload.open_questions.clone(),
            })
        }
        EventPayload::HandoffCompleted(payload) => {
            Oneof::HandoffCompleted(types::HandoffCompleted {
                handoff_id: payload.handoff_id.clone(),
                completed_by: opt_actor_to_proto(&payload.completed_by),
                outcome: payload.outcome.clone(),
            })
        }
        EventPayload::PolicyEvaluated(payload) => Oneof::PolicyEvaluated(types::PolicyEvaluated {
            policy_id: payload.policy_id.clone(),
            allowed: payload.allowed,
            approval_required: payload.approval_required,
            reason: payload.reason.clone(),
            action_type: payload.action_type.clone(),
            recipient: opt_actor_to_proto(&payload.recipient),
        }),
        EventPayload::ActionExecuted(payload) => Oneof::ActionExecuted(types::ActionExecuted {
            action: payload.action.as_ref().map(action_to_proto),
            result: payload.result.clone(),
            artifacts: payload.artifacts.iter().map(artifact_to_proto).collect(),
        }),
        EventPayload::ActionFailed(payload) => Oneof::ActionFailed(types::ActionFailed {
            action: payload.action.as_ref().map(action_to_proto),
            error_code: payload.error_code.clone(),
            error_message: payload.error_message.clone(),
            retryable: payload.retryable,
        }),
    })
}

fn payload_from_proto(payload: Oneof) -> Result<EventPayload, EventError> {
    Ok(match payload {
        Oneof::MessageReceived(message) => EventPayload::MessageReceived(MessageReceived {
            text: message.text,
            attachments: message.attachments.into_iter().map(artifact_from_proto).collect(),
            metadata: message.metadata,
        }),
        Oneof::MessageSent(message) => EventPayload::MessageSent(MessageSent {
            text: message.text,
            attachments: message.attachments.into_iter().map(artifact_from_proto).collect(),
            metadata: message.metadata,
        }),
        Oneof::TaskCreated(payload) => EventPayload::TaskCreated(TaskCreated {
            task_id: payload.task_id,
            intent: payload.intent,
            description: payload.description,
            requested_by: opt_actor_from_proto(payload.requested_by)?,
        }),
        Oneof::TaskAssigned(payload) => EventPayload::TaskAssigned(TaskAssigned {
            task_id: payload.task_id,
            assignee: opt_actor_from_proto(payload.assignee)?,
            reason: payload.reason,
        }),
        Oneof::ApprovalRequested(payload) => EventPayload::ApprovalRequested(ApprovalRequested {
            approval_id: payload.approval_id,
            agent: opt_actor_from_proto(payload.agent)?,
            requested_action: payload.requested_action.map(action_from_proto).transpose()?,
            reason: payload.reason,
            approver: opt_actor_from_proto(payload.approver)?,
            deadline: payload.deadline.map(|time| from_timestamp(Some(time))).transpose()?,
        }),
        Oneof::ApprovalDecided(payload) => EventPayload::ApprovalDecided(ApprovalDecided {
            approval_id: payload.approval_id,
            approver: opt_actor_from_proto(payload.approver)?,
            outcome: approval_outcome_from_proto(payload.outcome)?,
            reason: payload.reason,
        }),
        Oneof::ApprovalExpired(payload) => EventPayload::ApprovalExpired(ApprovalExpired {
            approval_id: payload.approval_id,
            reason: payload.reason,
        }),
        Oneof::EscalationTriggered(payload) => {
            EventPayload::EscalationTriggered(EscalationTriggered {
                escalation_id: payload.escalation_id,
                source: opt_actor_from_proto(payload.source)?,
                target: opt_actor_from_proto(payload.target)?,
                reason: payload.reason,
                related_approval_id: payload.related_approval_id,
            })
        }
        Oneof::HandoffInitiated(payload) => EventPayload::HandoffInitiated(HandoffInitiated {
            handoff_id: payload.handoff_id,
            from: opt_actor_from_proto(payload.from)?,
            to: opt_actor_from_proto(payload.to)?,
            reason: payload.reason,
            open_questions: payload.open_questions,
        }),
        Oneof::HandoffCompleted(payload) => EventPayload::HandoffCompleted(HandoffCompleted {
            handoff_id: payload.handoff_id,
            completed_by: opt_actor_from_proto(payload.completed_by)?,
            outcome: payload.outcome,
        }),
        Oneof::PolicyEvaluated(payload) => EventPayload::PolicyEvaluated(PolicyEvaluated {
            policy_id: payload.policy_id,
            allowed: payload.allowed,
            approval_required: payload.approval_required,
            reason: payload.reason,
            action_type: payload.action_type,
            recipient: opt_actor_from_proto(payload.recipient)?,
        }),
        Oneof::ActionExecuted(payload) => EventPayload::ActionExecuted(ActionExecuted {
            action: payload.action.map(action_from_proto).transpose()?,
            result: payload.result,
            artifacts: payload.artifacts.into_iter().map(artifact_from_proto).collect(),
        }),
        Oneof::ActionFailed(payload) => EventPayload::ActionFailed(ActionFailed {
            action: payload.action.map(action_from_proto).transpose()?,
            error_code: payload.error_code,
            error_message: payload.error_message,
            retryable: payload.retryable,
        }),
    })
}

fn action_to_proto(action: &ActionInvocation) -> types::ActionRequest {
    let json = ActionRequestJson::from(action.clone());
    types::ActionRequest {
        action_id: json.action_id,
        r#type: json.action_type,
        target: json.target,
        parameters: json.parameters.into_iter().collect::<BTreeMap<_, _>>(),
    }
}

fn action_from_proto(request: types::ActionRequest) -> Result<ActionInvocation, EventError> {
    let json = ActionRequestJson {
        action_id: request.action_id,
        action_type: request.r#type,
        target: request.target,
        parameters: request.parameters,
    };
    ActionInvocation::try_from(json).map_err(invalid)
}

const APPROVAL_OUTCOMES: [(types::ApprovalOutcome, ApprovalOutcome); 4] = [
    (types::ApprovalOutcome::Unspecified, ApprovalOutcome::Unspecified),
    (types::ApprovalOutcome::Granted, ApprovalOutcome::Granted),
    (types::ApprovalOutcome::Denied, ApprovalOutcome::Denied),
    (types::ApprovalOutcome::Expired, ApprovalOutcome::Expired),
];

fn approval_outcome_to_proto(outcome: ApprovalOutcome) -> types::ApprovalOutcome {
    APPROVAL_OUTCOMES
        .iter()
        .find(|(_, domain)| *domain == outcome)
        .map(|(proto, _)| *proto)
        .unwrap_or(types::ApprovalOutcome::Unspecified)
}

fn approval_outcome_from_proto(value: i32) -> Result<ApprovalOutcome, EventError> {
    APPROVAL_OUTCOMES
        .iter()
        .find(|(proto, _)| *proto as i32 == value)
        .map(|(_, domain)| *domain)
        .ok_or_else(|| invalid(format!("unknown approval outcome {value}")))
}

fn artifact_to_proto(artifact: &ArtifactRef) -> types::ArtifactRef {
    types::ArtifactRef {
        id: artifact.id.clone(),
        uri: artifact.uri.clone(),
        title: artifact.title.clone(),
        media_type: artifact.media_type.clone(),
        source_of_truth: artifact.source_of_truth.clone(),
    }
}

fn artifact_from_proto(artifact: types::ArtifactRef) -> ArtifactRef {
    ArtifactRef {
        id: artifact.id,
        uri: artifact.uri,
        title: artifact.title,
        media_type: artifact.media_type,
        source_of_truth: artifact.source_of_truth,
    }
}

fn opt_actor_to_proto(actor: &Option<ActorRef>) -> Option<types::ActorRef> {
    actor.as_ref().map(actor_to_proto)
}

fn opt_actor_from_proto(actor: Option<types::ActorRef>) -> Result<Option<ActorRef>, EventError> {
    actor.map(actor_from_proto).transpose()
}

fn actor_to_proto(actor: &ActorRef) -> types::ActorRef {
    let actor_type = match actor.actor_type {
        ActorType::Unspecified => types::ActorType::Unspecified,
        ActorType::Human => types::ActorType::Human,
        ActorType::Agent => types::ActorType::Agent,
        ActorType::System => types::ActorType::System,
    };
    types::ActorRef {
        id: actor.id.clone(),
        r#type: actor_type as i32,
        display_name: actor.display_name.clone(),
        authority: actor.authority.clone(),
        capabilities: actor.capabilities.clone(),
    }
}

fn actor_from_proto(actor: types::ActorRef) -> Result<ActorRef, EventError> {
    let actor_type = match types::ActorType::try_from(actor.r#type) {
        Ok(types::ActorType::Unspecified) => ActorType::Unspecified,
        Ok(types::ActorType::Human) => ActorType::Human,
        Ok(types::ActorType::Agent) => ActorType::Agent,
        Ok(types::ActorType::System) => ActorType::System,
        Err(_) => return Err(invalid(format!("unknown actor type {}", actor.r#type))),
    };
    Ok(ActorRef {
        id: actor.id,
        actor_type,
        display_name: actor.display_name,
        authority: actor.authority,
        capabilities: actor.capabilities,
    })
}

fn channel_to_proto(channel: &ChannelRef) -> types::ChannelRef {
    types::ChannelRef {
        provider: channel.provider.clone(),
        channel_id: channel.channel_id.clone(),
        thread_id: channel.thread_id.clone(),
        address: channel.address.clone(),
    }
}

fn channel_from_proto(channel: types::ChannelRef) -> ChannelRef {
    ChannelRef {
        provider: channel.provider,
        channel_id: channel.channel_id,
        thread_id: channel.thread_id,
        address: channel.address,
    }
}

fn conversation_to_proto(
    conversation: &ConversationRef,
) -> Result<types::ConversationRef, EventError> {
    let status = if conversation.status.is_empty() {
        types::ConversationStatus::Unspecified as i32
    } else {
        types::ConversationStatus::from_str_name(&conversation.status).ok_or_else(|| {
            invalid(format!("unknown conversation status {}", conversation.status))
        })? as i32
    };
    Ok(types::ConversationRef {
        id: conversation.id.clone(),
        status,
        participants: conversation.participants.iter().map(actor_to_proto).collect(),
    })
}

fn conversation_from_proto(
    conversation: types::ConversationRef,
) -> Result<ConversationRef, EventError> {
    let status = match types::ConversationStatus::try_from(conversation.status) {
        Ok(types::ConversationStatus::Unspecified) => String::new(),
        Ok(status) => status.as_str_name().to_owned(),
        Err(_) => {
            return Err(invalid(format!("unknown conversation status {}", conversation.status)))
        }
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
