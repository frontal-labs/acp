use std::collections::BTreeMap;
use std::ops::Deref;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use crate::events::{self, EventEnvelope};

pub type JsonObject = BTreeMap<String, serde_json::Value>;

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub enum ActorType {
    #[serde(rename = "ACTOR_TYPE_UNSPECIFIED")]
    Unspecified,
    #[serde(rename = "ACTOR_TYPE_HUMAN")]
    Human,
    #[serde(rename = "ACTOR_TYPE_AGENT")]
    #[default]
    Agent,
    #[serde(rename = "ACTOR_TYPE_SYSTEM")]
    System,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActorRef {
    pub id: String,
    #[serde(rename = "type")]
    pub actor_type: ActorType,
    pub display_name: String,
    pub authority: String,
    pub capabilities: Vec<String>,
}

impl ActorRef {
    pub fn agent(id: impl Into<String>, display_name: impl Into<String>) -> Self {
        Self {
            actor_type: ActorType::Agent,
            display_name: display_name.into(),
            id: id.into(),
            ..Self::default()
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChannelRef {
    pub provider: String,
    pub channel_id: String,
    pub thread_id: String,
    pub address: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConversationRef {
    pub id: String,
    pub status: String,
    pub participants: Vec<ActorRef>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentCapabilities {
    pub push_notifications: bool,
    pub state_transition_history: bool,
    pub streaming: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct AgentSkill {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub description: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub examples: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentCard {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub description: String,
    pub version: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub url: String,
    pub capabilities: AgentCapabilities,
    pub skills: Vec<AgentSkill>,
}

impl AgentCard {
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self { id: id.into(), name: name.into(), version: "1.0.0".to_owned(), ..Self::default() }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactRef {
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub id: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub uri: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub title: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub media_type: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub source_of_truth: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MessageReceived {
    pub text: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<ArtifactRef>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub metadata: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MessageSent {
    pub text: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<ArtifactRef>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub metadata: BTreeMap<String, String>,
}

/// An action request. On the wire this is `ActionRequest`: `action_type` is `type`, and `input`
/// travels as a JSON string under `parameters["input"]`, matching the TypeScript SDK.
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(try_from = "ActionRequestJson", into = "ActionRequestJson")]
pub struct ActionInvocation {
    pub action_id: String,
    pub input: serde_json::Value,
    pub action_type: String,
    /// `ActionRequest.target`; empty when unset.
    pub target: String,
    /// Parameters other than `input`. The `input` key is reserved: it is always written from
    /// [`ActionInvocation::input`] and is never read from this map.
    pub parameters: BTreeMap<String, String>,
}

/// ProtoJSON shape of `ocp.v1.types.ActionRequest`.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ActionRequestJson {
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub(crate) action_id: String,
    #[serde(default, rename = "type", skip_serializing_if = "String::is_empty")]
    pub(crate) action_type: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub(crate) target: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub(crate) parameters: BTreeMap<String, String>,
}

impl From<ActionInvocation> for ActionRequestJson {
    fn from(action: ActionInvocation) -> Self {
        let mut parameters = action.parameters;
        let input = serde_json::to_string(&action.input).unwrap_or_else(|_| "null".to_owned());
        parameters.insert("input".to_owned(), input);
        Self {
            action_id: action.action_id,
            action_type: action.action_type,
            target: action.target,
            parameters,
        }
    }
}

impl TryFrom<ActionRequestJson> for ActionInvocation {
    type Error = String;

    fn try_from(json: ActionRequestJson) -> Result<Self, Self::Error> {
        let mut parameters = json.parameters;
        let input = match parameters.remove("input") {
            Some(text) => serde_json::from_str(&text)
                .map_err(|error| format!("action input is not valid JSON: {error}"))?,
            None => serde_json::Value::Null,
        };
        Ok(Self {
            action_id: json.action_id,
            input,
            action_type: json.action_type,
            target: json.target,
            parameters,
        })
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum ActionResult {
    Blocked { action_id: String, reason: String },
    ApprovalRequired { action_id: String, approval_id: String },
    Executed { action_id: String, result: serde_json::Value },
    Failed { action_id: String, error: ActionError },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct ActionError {
    pub code: String,
    pub message: String,
    pub action_id: String,
    pub retryable: bool,
}

impl ActionError {
    fn from_agent_error(action_id: impl Into<String>, error: &AgentError) -> Self {
        Self {
            code: "OCP_ACTION".to_owned(),
            message: error.to_string(),
            action_id: action_id.into(),
            retryable: false,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct PolicyDecision {
    pub allowed: bool,
    pub approval_required: bool,
    pub reason: String,
}

pub trait ActionPolicy: Send + Sync {
    fn evaluate(&self, action: &ActionInvocation, event: &EventEnvelope) -> PolicyDecision;
}

pub struct ActionExecutionContext<'a> {
    pub actor: &'a ActorRef,
    pub event: &'a EventEnvelope,
}

impl<'a> Deref for ActionExecutionContext<'a> {
    type Target = EventEnvelope;

    fn deref(&self) -> &Self::Target {
        self.event
    }
}

type ActionValidator =
    dyn Fn(&serde_json::Value) -> Result<serde_json::Value, AgentError> + Send + Sync;
type ActionHandler = dyn for<'a> Fn(
        &serde_json::Value,
        &ActionExecutionContext<'a>,
    ) -> Result<serde_json::Value, AgentError>
    + Send
    + Sync;

pub struct ActionDefinition {
    pub action_type: String,
    validator: Box<ActionValidator>,
    handler: Box<ActionHandler>,
}

impl ActionDefinition {
    pub fn new<F>(action_type: impl Into<String>, handler: F) -> Self
    where
        F: for<'a> Fn(
                &serde_json::Value,
                &ActionExecutionContext<'a>,
            ) -> Result<serde_json::Value, AgentError>
            + Send
            + Sync
            + 'static,
    {
        Self {
            action_type: action_type.into(),
            handler: Box::new(handler),
            validator: Box::new(|value| Ok(value.clone())),
        }
    }

    pub fn with_validator<F>(mut self, validator: F) -> Self
    where
        F: Fn(&serde_json::Value) -> Result<serde_json::Value, AgentError> + Send + Sync + 'static,
    {
        self.validator = Box::new(validator);
        self
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AgentError {
    #[error("OCP agent is already registered: {0}")]
    DuplicateAgent(String),
    #[error("OCP action is not registered: {0}")]
    UnknownAction(String),
    #[error("OCP agent is not registered: {0}")]
    UnknownAgent(String),
    #[error("OCP provider is not registered: {0}")]
    UnknownProvider(String),
    #[error("OCP handler failed: {0}")]
    Handler(String),
    #[error("OCP action failed: {0}")]
    Action(String),
}

type AgentHandler = dyn for<'a> Fn(&mut AgentContext<'a>) -> Result<(), AgentError> + Send + Sync;

pub struct AgentDefinition {
    pub card: AgentCard,
    pub actor_capabilities: Vec<String>,
    handler: Box<AgentHandler>,
}

impl AgentDefinition {
    pub fn new<F>(card: AgentCard, handler: F) -> Self
    where
        F: for<'a> Fn(&mut AgentContext<'a>) -> Result<(), AgentError> + Send + Sync + 'static,
    {
        Self { actor_capabilities: Vec::new(), card, handler: Box::new(handler) }
    }
}

pub struct AgentContext<'a> {
    pub agent: ActorRef,
    pub card: AgentCard,
    pub event: &'a EventEnvelope,
    pub message: MessageReceived,
    actions: Vec<ActionInvocation>,
    replies: Vec<EventEnvelope>,
}

impl<'a> AgentContext<'a> {
    pub fn reply(&mut self, text: impl Into<String>) -> &EventEnvelope {
        // Replies use the protocol version of the event being answered.
        let mut reply = events::message_sent(self.event.protocol_version, text);
        reply.actor = Some(self.agent.clone());
        reply.causation_id = self.event.event_id.clone();
        reply.correlation_id = if self.event.correlation_id.is_empty() {
            self.event.event_id.clone()
        } else {
            self.event.correlation_id.clone()
        };
        reply.recipient = self.event.actor.clone();
        reply.source = Some(self.agent.clone());
        reply.channel = self.event.channel.clone();
        reply.conversation = self.event.conversation.clone();
        // The index is valid because the reply was pushed on the line above.
        let index = self.replies.len();
        self.replies.push(reply);
        &self.replies[index]
    }

    pub fn request_action(
        &mut self,
        action_type: impl Into<String>,
        input: serde_json::Value,
    ) -> String {
        let action_id = format!("action:{}", Uuid::new_v4());
        self.actions.push(ActionInvocation {
            action_id: action_id.clone(),
            input,
            action_type: action_type.into(),
            ..ActionInvocation::default()
        });
        action_id
    }

    fn finish(self) -> (Vec<EventEnvelope>, Vec<ActionInvocation>) {
        (self.replies, self.actions)
    }
}

#[derive(Debug, Default)]
pub struct HandleResult {
    pub handled: bool,
    pub action_results: Vec<ActionResult>,
    pub actions: Vec<ActionInvocation>,
    pub replies: Vec<EventEnvelope>,
}

#[derive(Default)]
pub struct AgentHost {
    agents: BTreeMap<String, AgentDefinition>,
}

impl AgentHost {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, agent: AgentDefinition) -> Result<&mut Self, AgentError> {
        if self.agents.contains_key(&agent.card.id) {
            return Err(AgentError::DuplicateAgent(agent.card.id.clone()));
        }
        self.agents.insert(agent.card.id.clone(), agent);
        Ok(self)
    }

    pub fn unregister(&mut self, agent_id: &str) -> bool {
        self.agents.remove(agent_id).is_some()
    }

    pub fn get_agent_card(&self, agent_id: &str) -> Option<&AgentCard> {
        self.agents.get(agent_id).map(|agent| &agent.card)
    }

    pub fn list_agent_cards(&self) -> Vec<&AgentCard> {
        self.agents.values().map(|agent| &agent.card).collect()
    }

    pub fn handle(&self, event: &EventEnvelope) -> Result<HandleResult, AgentError> {
        if events::event_type_of(event) != "message.received" {
            return Ok(HandleResult::default());
        }
        let Some(message) = event.message_received_payload().cloned() else {
            return Ok(HandleResult::default());
        };
        let agent_id =
            event.recipient.as_ref().map(|recipient| recipient.id.as_str()).unwrap_or_default();
        let agent = self
            .agents
            .get(agent_id)
            .ok_or_else(|| AgentError::UnknownAgent(agent_id.to_owned()))?;
        let context_agent = ActorRef {
            capabilities: agent.actor_capabilities.clone(),
            display_name: agent.card.name.clone(),
            id: agent.card.id.clone(),
            ..ActorRef::agent(&agent.card.id, &agent.card.name)
        };
        let mut context = AgentContext {
            agent: context_agent,
            card: agent.card.clone(),
            event,
            message,
            actions: Vec::new(),
            replies: Vec::new(),
        };
        (agent.handler)(&mut context)?;
        let (replies, actions) = context.finish();
        Ok(HandleResult { action_results: Vec::new(), actions, handled: true, replies })
    }
}

pub trait ChannelSource: Send {
    fn provider(&self) -> &str;
    fn normalize(&self, input: serde_json::Value) -> Result<Vec<EventEnvelope>, AgentError>;

    fn start(&mut self) -> Result<(), AgentError> {
        Ok(())
    }

    fn stop(&mut self) -> Result<(), AgentError> {
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct DeliveryReceipt {
    pub provider: String,
    pub event_id: String,
    pub delivered_at: String,
    pub external_id: Option<String>,
}

pub trait ChannelSink: Send {
    fn provider(&self) -> &str;
    fn send(&mut self, event: &EventEnvelope) -> Result<DeliveryReceipt, AgentError>;

    fn close(&mut self) -> Result<(), AgentError> {
        Ok(())
    }
}

pub struct ChannelDefinition {
    pub provider: String,
    pub source: Option<Box<dyn ChannelSource>>,
    pub sink: Option<Box<dyn ChannelSink>>,
}

struct PendingAction {
    action: ActionInvocation,
    event: EventEnvelope,
}

fn action_id(result: &ActionResult) -> String {
    match result {
        ActionResult::Blocked { action_id, .. }
        | ActionResult::ApprovalRequired { action_id, .. }
        | ActionResult::Executed { action_id, .. }
        | ActionResult::Failed { action_id, .. } => action_id.clone(),
    }
}

pub struct OcpAppBuilder {
    host: AgentHost,
    actions: BTreeMap<String, ActionDefinition>,
    channels: Vec<ChannelDefinition>,
    policy: Option<Box<dyn ActionPolicy>>,
    max_concurrent_conversations: usize,
}

impl Default for OcpAppBuilder {
    fn default() -> Self {
        Self {
            host: AgentHost::new(),
            actions: BTreeMap::new(),
            channels: Vec::new(),
            policy: None,
            max_concurrent_conversations: usize::MAX,
        }
    }
}

impl OcpAppBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn agent(mut self, agent: AgentDefinition) -> Result<Self, AgentError> {
        self.host.register(agent)?;
        Ok(self)
    }

    pub fn action(mut self, action: ActionDefinition) -> Result<Self, AgentError> {
        if self.actions.contains_key(&action.action_type) {
            return Err(AgentError::Action(format!(
                "action already registered: {}",
                action.action_type
            )));
        }
        self.actions.insert(action.action_type.clone(), action);
        Ok(self)
    }

    pub fn channel(mut self, channel: ChannelDefinition) -> Self {
        self.channels.push(channel);
        self
    }

    pub fn policy(mut self, policy: Box<dyn ActionPolicy>) -> Self {
        self.policy = Some(policy);
        self
    }

    pub fn max_concurrent_conversations(mut self, limit: usize) -> Self {
        self.max_concurrent_conversations = limit.max(1);
        self
    }

    pub fn build(self) -> OcpApp {
        OcpApp {
            host: self.host,
            actions: self.actions,
            channels: self.channels,
            pending: BTreeMap::new(),
            policy: self.policy,
            seen_events: BTreeMap::new(),
            started: false,
            max_concurrent_conversations: self.max_concurrent_conversations,
            action_results: BTreeMap::new(),
            audit_events: Vec::new(),
        }
    }
}

pub struct OcpApp {
    host: AgentHost,
    actions: BTreeMap<String, ActionDefinition>,
    channels: Vec<ChannelDefinition>,
    pending: BTreeMap<String, PendingAction>,
    policy: Option<Box<dyn ActionPolicy>>,
    seen_events: BTreeMap<String, EventEnvelope>,
    started: bool,
    max_concurrent_conversations: usize,
    action_results: BTreeMap<String, ActionResult>,
    audit_events: Vec<EventEnvelope>,
}

impl OcpApp {
    pub fn start(&mut self) -> Result<(), AgentError> {
        for channel in &mut self.channels {
            if let Some(source) = channel.source.as_mut() {
                source.start()?;
            }
        }
        self.started = true;
        Ok(())
    }

    pub fn stop(&mut self) -> Result<(), AgentError> {
        for channel in &mut self.channels {
            if let Some(source) = channel.source.as_mut() {
                source.stop()?;
            }
            if let Some(sink) = channel.sink.as_mut() {
                sink.close()?;
            }
        }
        self.started = false;
        Ok(())
    }

    pub fn max_concurrent_conversations(&self) -> usize {
        self.max_concurrent_conversations
    }

    pub fn audit_events(&self) -> &[EventEnvelope] {
        &self.audit_events
    }

    pub fn register_agent(&mut self, agent: AgentDefinition) -> Result<&mut Self, AgentError> {
        self.host.register(agent)?;
        Ok(self)
    }

    pub fn register_action(&mut self, action: ActionDefinition) -> Result<&mut Self, AgentError> {
        if self.actions.contains_key(&action.action_type) {
            return Err(AgentError::Action(format!(
                "action already registered: {}",
                action.action_type
            )));
        }
        self.actions.insert(action.action_type.clone(), action);
        Ok(self)
    }

    pub fn register_channel(&mut self, channel: ChannelDefinition) -> &mut Self {
        self.channels.push(channel);
        self
    }

    pub fn ingest(&mut self, event: EventEnvelope) -> Result<HandleResult, AgentError> {
        if !self.started {
            self.started = true;
        }
        if self.seen_events.contains_key(&event.event_id) {
            return Ok(HandleResult::default());
        }
        self.seen_events.insert(event.event_id.clone(), event.clone());
        let mut result = self.host.handle(&event)?;
        self.audit_events.push(event.clone());
        self.dispatch_replies(&result.replies)?;
        for action in result.actions.iter().cloned() {
            if let Some(previous) = self.action_results.get(&action.action_id).cloned() {
                result.action_results.push(previous);
                continue;
            }
            let decision =
                self.policy.as_ref().map(|policy| policy.evaluate(&action, &event)).unwrap_or(
                    PolicyDecision {
                        allowed: false,
                        approval_required: false,
                        reason: "No policy configured".to_owned(),
                    },
                );
            if !decision.allowed {
                let blocked =
                    ActionResult::Blocked { action_id: action.action_id, reason: decision.reason };
                self.action_results.insert(action_id(&blocked), blocked.clone());
                result.action_results.push(blocked);
            } else if decision.approval_required {
                let approval_id = format!("{}:approval", action.action_id);
                let requested_action_id = action.action_id.clone();
                self.pending
                    .insert(approval_id.clone(), PendingAction { action, event: event.clone() });
                let pending_result =
                    ActionResult::ApprovalRequired { action_id: requested_action_id, approval_id };
                self.action_results.insert(action_id(&pending_result), pending_result.clone());
                result.action_results.push(pending_result);
            } else {
                let action_result = self.execute_action(action, &event)?;
                self.action_results.insert(action_id(&action_result), action_result.clone());
                result.action_results.push(action_result);
            }
        }
        Ok(result)
    }

    pub fn receive(
        &mut self,
        provider: &str,
        input: serde_json::Value,
    ) -> Result<Vec<HandleResult>, AgentError> {
        let source = self
            .channels
            .iter()
            .find(|channel| channel.provider == provider)
            .and_then(|channel| channel.source.as_ref())
            .ok_or_else(|| AgentError::UnknownProvider(provider.to_owned()))?;
        let events = source.normalize(input)?;
        events.into_iter().map(|event| self.ingest(event)).collect()
    }

    pub fn approve(&mut self, approval_id: &str) -> Result<ActionResult, AgentError> {
        let pending = self
            .pending
            .remove(approval_id)
            .ok_or_else(|| AgentError::Action(format!("approval not found: {approval_id}")))?;
        let result = self.execute_action(pending.action, &pending.event)?;
        self.action_results.insert(action_id(&result), result.clone());
        Ok(result)
    }

    pub fn deny(
        &mut self,
        approval_id: &str,
        reason: impl Into<String>,
    ) -> Result<ActionResult, AgentError> {
        let pending = self
            .pending
            .remove(approval_id)
            .ok_or_else(|| AgentError::Action(format!("approval not found: {approval_id}")))?;
        let result =
            ActionResult::Blocked { action_id: pending.action.action_id, reason: reason.into() };
        self.action_results.insert(action_id(&result), result.clone());
        Ok(result)
    }

    pub fn list_agent_cards(&self) -> Vec<&AgentCard> {
        self.host.list_agent_cards()
    }

    fn execute_action(
        &self,
        action: ActionInvocation,
        event: &EventEnvelope,
    ) -> Result<ActionResult, AgentError> {
        let definition = self
            .actions
            .get(&action.action_type)
            .ok_or_else(|| AgentError::UnknownAction(action.action_type.clone()))?;
        let input = match (definition.validator)(&action.input) {
            Ok(input) => input,
            Err(error) => {
                return Ok(ActionResult::Failed {
                    action_id: action.action_id.clone(),
                    error: ActionError::from_agent_error(action.action_id, &error),
                });
            }
        };
        let default_actor = ActorRef::default();
        let context =
            ActionExecutionContext { actor: event.actor.as_ref().unwrap_or(&default_actor), event };
        match (definition.handler)(&input, &context) {
            Ok(result) => Ok(ActionResult::Executed { action_id: action.action_id, result }),
            Err(error) => Ok(ActionResult::Failed {
                error: ActionError::from_agent_error(action.action_id.clone(), &error),
                action_id: action.action_id,
            }),
        }
    }

    fn dispatch_replies(&mut self, replies: &[EventEnvelope]) -> Result<(), AgentError> {
        for reply in replies {
            let provider =
                reply.channel.as_ref().map(|channel| channel.provider.as_str()).unwrap_or_default();
            let channel = self
                .channels
                .iter_mut()
                .find(|channel| channel.provider == provider)
                .ok_or_else(|| AgentError::UnknownProvider(provider.to_owned()))?;
            if let Some(sink) = channel.sink.as_mut() {
                sink.send(reply)?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use crate::events::{EventPayload, ProtocolVersion};

    fn inbound_message(version: ProtocolVersion, text: &str) -> EventEnvelope {
        let mut event = events::message_received(version, text);
        event.actor = Some(ActorRef {
            actor_type: ActorType::Human,
            id: "human:gabriel".to_owned(),
            ..ActorRef::default()
        });
        event.recipient = Some(ActorRef::agent("agent:support", "Support"));
        event
    }

    #[test]
    fn routes_message_and_creates_reply_for_both_protocol_versions() {
        for version in [ProtocolVersion::V0_1, ProtocolVersion::V0_2] {
            let mut host = AgentHost::new();
            let card = AgentCard::new("agent:support", "Support");
            host.register(AgentDefinition::new(card, |context| {
                let text = format!("Received: {}", context.message.text);
                context.reply(text);
                Ok(())
            }))
            .expect("agent registers");

            let event = inbound_message(version, "Can you help?");
            let result = host.handle(&event).expect("event is handled");

            assert!(result.handled);
            assert_eq!(result.replies.len(), 1);
            assert_eq!(result.replies[0].protocol_version, version);
            assert_eq!(result.replies[0].event_type.is_some(), version == ProtocolVersion::V0_1);
            assert_eq!(events::event_type_of(&result.replies[0]), "message.sent");
            assert!(matches!(
                result.replies[0].payload,
                EventPayload::MessageSent(MessageSent { ref text, .. }) if text == "Received: Can you help?"
            ));
        }
    }

    struct RequireApprovalPolicy;

    impl ActionPolicy for RequireApprovalPolicy {
        fn evaluate(&self, _action: &ActionInvocation, _event: &EventEnvelope) -> PolicyDecision {
            PolicyDecision {
                allowed: true,
                approval_required: true,
                reason: "refunds need approval".to_owned(),
            }
        }
    }

    fn approval_app() -> OcpApp {
        OcpAppBuilder::new()
            .agent(AgentDefinition::new(AgentCard::new("agent:billing", "Billing"), |context| {
                context.request_action("refund", serde_json::json!({ "amount": 10 }));
                Ok(())
            }))
            .expect("agent registers")
            .action(ActionDefinition::new("refund", |input, _context| Ok(input.clone())))
            .expect("action registers")
            .policy(Box::new(RequireApprovalPolicy))
            .build()
    }

    fn approval_message() -> EventEnvelope {
        let mut event = inbound_message(ProtocolVersion::V0_1, "Refund order 42");
        event.recipient = Some(ActorRef::agent("agent:billing", "Billing"));
        event.source = event.actor.clone();
        event
    }

    #[test]
    fn approval_required_result_keeps_requested_action_id_and_resolves_by_approval_id() {
        let mut app = approval_app();
        app.start().expect("app starts");
        let event = approval_message();

        let result = app.ingest(event.clone()).expect("event is ingested");

        assert_eq!(result.actions.len(), 1);
        let requested_action_id = result.actions[0].action_id.clone();
        assert_eq!(result.action_results.len(), 1);
        let ActionResult::ApprovalRequired { action_id, approval_id } = &result.action_results[0]
        else {
            panic!("expected approval required, got {:?}", result.action_results[0]);
        };
        assert_eq!(action_id, &requested_action_id);
        assert_eq!(approval_id, &format!("{requested_action_id}:approval"));

        let approved = app.approve(approval_id).expect("approval resolves");
        assert_eq!(
            approved,
            ActionResult::Executed {
                action_id: requested_action_id.clone(),
                result: serde_json::json!({ "amount": 10 }),
            }
        );

        let mut denied_app = approval_app();
        denied_app.start().expect("app starts");
        let denied_result = denied_app.ingest(event).expect("event is ingested");
        let denied_action_id = denied_result.actions[0].action_id.clone();
        let ActionResult::ApprovalRequired { action_id, approval_id } =
            &denied_result.action_results[0]
        else {
            panic!("expected approval required");
        };
        assert_eq!(action_id, &denied_action_id);
        let denied = denied_app.deny(approval_id, "not authorized").expect("denial resolves");
        assert_eq!(
            denied,
            ActionResult::Blocked {
                action_id: denied_action_id,
                reason: "not authorized".to_owned(),
            }
        );
    }

    #[test]
    fn exposes_agent_cards() {
        let mut host = AgentHost::new();
        host.register(AgentDefinition::new(AgentCard::new("agent:triage", "Triage"), |_| Ok(())))
            .expect("agent registers");

        assert_eq!(host.list_agent_cards()[0].name, "Triage");
    }
}
