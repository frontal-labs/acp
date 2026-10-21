pub mod generated {
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../proto/gen/rust/mod.rs"));
}

mod binary;
mod events;
mod models;
mod payloads;

pub use events::{
    action_executed, action_failed, approval_decided, approval_expired, approval_requested,
    escalation_triggered, event_type_of, handoff_completed, handoff_initiated, message_received,
    message_sent, policy_evaluated, task_assigned, task_created, EventEnvelope, EventError,
    EventPayload, ProtocolVersion,
};
pub use models::{
    AcpApp, AcpAppBuilder, ActionDefinition, ActionError, ActionExecutionContext, ActionInvocation,
    ActionPolicy, ActionResult, ActorRef, ActorType, AgentCapabilities, AgentCard, AgentContext,
    AgentDefinition, AgentHost, AgentSkill, ArtifactRef, ChannelDefinition, ChannelRef,
    ChannelSink, ChannelSource, ConversationRef, DeliveryReceipt, HandleResult, JsonObject,
    MessageReceived, MessageSent, PolicyDecision,
};
pub use payloads::{
    ActionExecuted, ActionFailed, ApprovalDecided, ApprovalExpired, ApprovalOutcome,
    ApprovalRequested, EscalationTriggered, HandoffCompleted, HandoffInitiated, PolicyEvaluated,
    TaskAssigned, TaskCreated,
};
