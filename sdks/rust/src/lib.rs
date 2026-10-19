pub mod generated {
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../proto/gen/rust/mod.rs"));
}

mod models;
pub mod v2;

pub use models::{
    AcpApp, AcpAppBuilder, ActionDefinition, ActionError, ActionExecutionContext, ActionInvocation,
    ActionPolicy, ActionResult, ActorRef, ActorType, AgentCapabilities, AgentCard, AgentContext,
    AgentDefinition, AgentHost, AgentSkill, ChannelDefinition, ChannelRef, ChannelSink,
    ChannelSource, ConversationRef, DeliveryReceipt, EventEnvelope, EventPayload, HandleResult,
    MessageReceived, MessageSent, PolicyDecision,
};
pub use v2::{
    action_executed, action_failed, approval_requested, event_to_binary, event_to_json,
    message_received, message_sent, parse_event, V2EventEnvelope, V2EventPayload,
    ACP_V2_PROTOCOL_VERSION,
};
