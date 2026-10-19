use std::collections::BTreeMap;
use std::ops::Deref;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

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
        Self { id: id.into(), name: name.into(), version: "0.1.0".to_owned(), ..Self::default() }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MessageReceived {
    pub text: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<JsonObject>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub metadata: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MessageSent {
    pub text: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<JsonObject>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub metadata: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActionInvocation {
    pub action_id: String,
    pub input: serde_json::Value,
    pub action_type: String,
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
            code: "ACP_ACTION".to_owned(),
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

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum EventPayload {
    #[serde(rename = "messageReceived")]
    MessageReceived(MessageReceived),
    #[serde(rename = "messageSent")]
    MessageSent(MessageSent),
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EventEnvelope {
    pub event_id: String,
    pub event_type: String,
    pub protocol_version: String,
    pub occurred_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<ActorRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor: Option<ActorRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recipient: Option<ActorRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<ChannelRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conversation: Option<ConversationRef>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub correlation_id: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub causation_id: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub idempotency_key: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub extensions: BTreeMap<String, String>,
    #[serde(flatten)]
    pub payload: EventPayload,
}

impl EventEnvelope {
    pub fn message_received(
        actor: Option<ActorRef>,
        recipient: Option<ActorRef>,
        text: impl Into<String>,
    ) -> Self {
        Self {
            actor: actor.clone(),
            event_id: Uuid::new_v4().to_string(),
            event_type: "message.received".to_owned(),
            occurred_at: now_rfc3339(),
            payload: EventPayload::MessageReceived(MessageReceived {
                text: text.into(),
                ..MessageReceived::default()
            }),
            protocol_version: "0.1".to_owned(),
            recipient,
            source: actor,
            ..Self::default_without_payload()
        }
    }

    fn default_without_payload() -> Self {
        Self {
            event_id: String::new(),
            event_type: String::new(),
            protocol_version: String::new(),
            occurred_at: String::new(),
            source: None,
            actor: None,
            recipient: None,
            channel: None,
            conversation: None,
            correlation_id: String::new(),
            causation_id: String::new(),
            idempotency_key: String::new(),
            extensions: BTreeMap::new(),
            payload: EventPayload::MessageReceived(MessageReceived::default()),
        }
    }

    pub fn message_received_payload(&self) -> Option<&MessageReceived> {
        match &self.payload {
            EventPayload::MessageReceived(message) => Some(message),
            EventPayload::MessageSent(_) => None,
        }
    }

    pub fn to_proto_json(&self) -> Result<serde_json::Value, serde_json::Error> {
        serde_json::to_value(self)
    }
}

pub(crate) fn now_rfc3339() -> String {
    let elapsed = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let days = (elapsed.as_secs() / 86_400) as i64;
    let seconds = elapsed.as_secs() % 86_400;
    let (year, month, day) = civil_from_days(days);
    let hour = seconds / 3_600;
    let minute = (seconds % 3_600) / 60;
    let second = seconds % 60;
    format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{:03}Z",
        elapsed.subsec_millis()
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

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AgentError {
    #[error("ACP agent is already registered: {0}")]
    DuplicateAgent(String),
    #[error("ACP action is not registered: {0}")]
    UnknownAction(String),
    #[error("ACP agent is not registered: {0}")]
    UnknownAgent(String),
    #[error("ACP provider is not registered: {0}")]
    UnknownProvider(String),
    #[error("ACP handler failed: {0}")]
    Handler(String),
    #[error("ACP action failed: {0}")]
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
        let reply = EventEnvelope {
            actor: Some(self.agent.clone()),
            causation_id: self.event.event_id.clone(),
            correlation_id: if self.event.correlation_id.is_empty() {
                self.event.event_id.clone()
            } else {
                self.event.correlation_id.clone()
            },
            event_id: Uuid::new_v4().to_string(),
            event_type: "message.sent".to_owned(),
            occurred_at: now_rfc3339(),
            payload: EventPayload::MessageSent(MessageSent {
                text: text.into(),
                ..MessageSent::default()
            }),
            protocol_version: "0.1".to_owned(),
            recipient: self.event.actor.clone(),
            source: Some(self.agent.clone()),
            channel: self.event.channel.clone(),
            conversation: self.event.conversation.clone(),
            ..EventEnvelope::default_without_payload()
        };
        self.replies.push(reply);
        self.replies.last().expect("reply was just pushed")
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
        if event.event_type != "message.received" {
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

pub struct AcpAppBuilder {
    host: AgentHost,
    actions: BTreeMap<String, ActionDefinition>,
    channels: Vec<ChannelDefinition>,
    policy: Option<Box<dyn ActionPolicy>>,
    max_concurrent_conversations: usize,
}

impl Default for AcpAppBuilder {
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

impl AcpAppBuilder {
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

    pub fn build(self) -> AcpApp {
        AcpApp {
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

pub struct AcpApp {
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

impl AcpApp {
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
                let action_id = action.action_id.clone();
                self.pending
                    .insert(approval_id.clone(), PendingAction { action, event: event.clone() });
                let pending_result = ActionResult::ApprovalRequired { action_id, approval_id };
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
mod tests {
    use super::*;

    #[test]
    fn routes_message_and_creates_reply() {
        let mut host = AgentHost::new();
        let card = AgentCard::new("agent:support", "Support");
        host.register(AgentDefinition::new(card, |context| {
            let text = format!("Received: {}", context.message.text);
            context.reply(text);
            Ok(())
        }))
        .expect("agent registers");

        let event = EventEnvelope::message_received(
            Some(ActorRef {
                actor_type: ActorType::Human,
                id: "human:gabriel".to_owned(),
                ..ActorRef::default()
            }),
            Some(ActorRef::agent("agent:support", "Support")),
            "Can you help?",
        );
        let result = host.handle(&event).expect("event is handled");

        assert!(result.handled);
        assert_eq!(result.replies.len(), 1);
        assert!(matches!(
            result.replies[0].payload,
            EventPayload::MessageSent(MessageSent { ref text, .. }) if text == "Received: Can you help?"
        ));
    }

    #[test]
    fn exposes_agent_cards() {
        let mut host = AgentHost::new();
        host.register(AgentDefinition::new(AgentCard::new("agent:triage", "Triage"), |_| Ok(())))
            .expect("agent registers");

        assert_eq!(host.list_agent_cards()[0].name, "Triage");
    }
}
