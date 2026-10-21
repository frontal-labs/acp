//! Typed payloads for the protobuf `payload` oneof, other than messages (see `models`).
//!
//! Field names follow the ProtoJSON camelCase form via serde, so the same structs back both the
//! JSON and binary codecs. Message-typed proto fields are `Option`s so that an absent submessage
//! stays absent on re-encode.

use serde::{Deserialize, Serialize};

use crate::models::{ActionInvocation, ActorRef, ArtifactRef};

/// Outcome of an approval decision. Only `Granted` and `Denied` are valid in an
/// `approval.granted` / `approval.denied` event.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Deserialize, Serialize)]
pub enum ApprovalOutcome {
    #[default]
    #[serde(rename = "APPROVAL_OUTCOME_UNSPECIFIED")]
    Unspecified,
    #[serde(rename = "APPROVAL_OUTCOME_GRANTED")]
    Granted,
    #[serde(rename = "APPROVAL_OUTCOME_DENIED")]
    Denied,
    #[serde(rename = "APPROVAL_OUTCOME_EXPIRED")]
    Expired,
}

#[derive(Clone, Debug, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TaskCreated {
    pub task_id: String,
    pub intent: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_by: Option<ActorRef>,
}

#[derive(Clone, Debug, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TaskAssigned {
    pub task_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<ActorRef>,
    pub reason: String,
}

#[derive(Clone, Debug, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ApprovalRequested {
    pub approval_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<ActorRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_action: Option<ActionInvocation>,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approver: Option<ActorRef>,
    /// RFC 3339 UTC timestamp, the ProtoJSON form of `google.protobuf.Timestamp`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deadline: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ApprovalDecided {
    pub approval_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approver: Option<ActorRef>,
    pub outcome: ApprovalOutcome,
    pub reason: String,
}

#[derive(Clone, Debug, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ApprovalExpired {
    pub approval_id: String,
    pub reason: String,
}

#[derive(Clone, Debug, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct EscalationTriggered {
    pub escalation_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<ActorRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<ActorRef>,
    pub reason: String,
    pub related_approval_id: String,
}

#[derive(Clone, Debug, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HandoffInitiated {
    pub handoff_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<ActorRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<ActorRef>,
    pub reason: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub open_questions: Vec<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HandoffCompleted {
    pub handoff_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_by: Option<ActorRef>,
    pub outcome: String,
}

#[derive(Clone, Debug, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PolicyEvaluated {
    pub policy_id: String,
    pub allowed: bool,
    pub approval_required: bool,
    pub reason: String,
    pub action_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipient: Option<ActorRef>,
}

#[derive(Clone, Debug, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ActionExecuted {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<ActionInvocation>,
    /// Result as a string. A JSON result is carried as its JSON text.
    pub result: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub artifacts: Vec<ArtifactRef>,
}

#[derive(Clone, Debug, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ActionFailed {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<ActionInvocation>,
    pub error_code: String,
    pub error_message: String,
    pub retryable: bool,
}
