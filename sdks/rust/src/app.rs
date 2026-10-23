//! The OCP application: agents, actions, channels, policy, approvals, and an event store behind one
//! value. Every method takes `&self`, so one application can be shared across threads.

use std::collections::{BTreeMap, HashSet};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError, Weak};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime};

use crate::events::{
    self, rfc3339_to_system_time, system_time_to_rfc3339, EventEnvelope, EventPayload,
};
use crate::models::{
    ActionDefinition, ActionError, ActionExecutionContext, ActionInvocation, ActionPolicy,
    ActionResult, ActorRef, ActorType, AgentCard, AgentDefinition, AgentError, AgentHost,
    ChannelDefinition, DeliveryReceipt, HandleResult, Logger, PolicyDecision, ReceiveMetadata,
    StderrLogger,
};
use crate::payloads::ApprovalOutcome;

/// How long an approval waits for a decision unless the builder sets otherwise.
const DEFAULT_APPROVAL_TIMEOUT: Duration = Duration::from_secs(60);
const APPROVAL_EXPIRED_REASON: &str = "Approval deadline expired";
/// Event names only the application may produce; inbound copies are rejected.
/// Event types only the application produces. An inbound copy is forged and is rejected.
const APP_PRODUCED_EVENTS: [&str; 7] = [
    "approval.requested",
    "approval.granted",
    "approval.denied",
    "approval.expired",
    "action.executed",
    "action.failed",
    "escalation.triggered",
];

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn runtime_actor_default() -> ActorRef {
    ActorRef {
        actor_type: ActorType::System,
        id: "system:ocp".to_owned(),
        display_name: "OCP runtime".to_owned(),
        ..ActorRef::default()
    }
}

/// The source of time for deadlines and event timestamps.
pub trait Clock: Send + Sync {
    fn now(&self) -> SystemTime;
}

/// The system wall clock.
#[derive(Clone, Copy, Debug, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> SystemTime {
        SystemTime::now()
    }
}

/// A clock that only moves when told to. Use it in tests to drive deadlines.
#[derive(Debug)]
pub struct ManualClock {
    now: Mutex<SystemTime>,
}

impl ManualClock {
    pub fn new(now: SystemTime) -> Self {
        Self { now: Mutex::new(now) }
    }

    pub fn set(&self, now: SystemTime) {
        *lock(&self.now) = now;
    }

    pub fn advance(&self, by: Duration) {
        let mut now = lock(&self.now);
        *now += by;
    }
}

impl Clock for ManualClock {
    fn now(&self) -> SystemTime {
        *lock(&self.now)
    }
}

/// Durable storage for accepted events. Implement it over a database to survive restarts;
/// [`MemoryEventStore`] keeps events in memory.
pub trait EventStore: Send + Sync {
    /// Stores `event` unless its ID is already present. Returns `true` when it was stored.
    fn append_if_absent(&self, event: &EventEnvelope) -> bool;
    /// Every stored event, in arrival order.
    fn events(&self) -> Vec<EventEnvelope>;
    /// Stored events of one type, in arrival order. Override it for an indexed lookup.
    fn query_by_type(&self, event_type: &str) -> Vec<EventEnvelope> {
        self.events().into_iter().filter(|event| event.event_type() == event_type).collect()
    }
}

#[derive(Default)]
struct MemoryState {
    events: Vec<EventEnvelope>,
    ids: HashSet<String>,
}

/// An in-memory [`EventStore`]. Events are lost when the process exits.
#[derive(Default)]
pub struct MemoryEventStore {
    state: Mutex<MemoryState>,
}

impl EventStore for MemoryEventStore {
    fn append_if_absent(&self, event: &EventEnvelope) -> bool {
        let mut state = lock(&self.state);
        if !state.ids.insert(event.event_id.clone()) {
            return false;
        }
        state.events.push(event.clone());
        true
    }

    fn events(&self) -> Vec<EventEnvelope> {
        lock(&self.state).events.clone()
    }

    fn query_by_type(&self, event_type: &str) -> Vec<EventEnvelope> {
        lock(&self.state)
            .events
            .iter()
            .filter(|event| event.event_type() == event_type)
            .cloned()
            .collect()
    }
}

/// A hook or subscriber callback over `T`.
pub type Callback<T> = Box<dyn Fn(&T) + Send + Sync>;

type Subscriber = Callback<EventEnvelope>;

/// Optional callbacks for observing the application. Every field is optional.
#[derive(Default)]
pub struct Hooks {
    /// An inbound event was accepted into the store.
    pub on_event_accepted: Option<Callback<EventEnvelope>>,
    /// An inbound event finished processing.
    pub on_event_processed: Option<Callback<EventEnvelope>>,
    /// An action is about to run.
    pub on_action_started: Option<Callback<ActionInvocation>>,
    /// An action produced its result.
    pub on_action_completed: Option<Callback<ActionResult>>,
    /// An outbound event was delivered by a sink.
    pub on_delivery: Option<Callback<DeliveryReceipt>>,
    /// Processing failed.
    pub on_error: Option<Callback<AgentError>>,
}

struct PendingAction {
    action: ActionInvocation,
    /// The agent that requested the action.
    agent: ActorRef,
    /// The only actor allowed to decide this approval.
    approver: ActorRef,
    /// The `approval.requested` event. It carries the actor, conversation, and channel needed to
    /// run the action, so a restored approval can execute without the original inbound event.
    event: EventEnvelope,
    /// `None` means the approval never expires.
    deadline: Option<SystemTime>,
}

/// Wakes the expiry timer when approvals change or the application stops.
#[derive(Default)]
struct Signal {
    state: Mutex<SignalState>,
    changed: Condvar,
}

#[derive(Default)]
struct SignalState {
    shutdown: bool,
    wake: bool,
}

impl Signal {
    fn reset(&self) {
        let mut state = lock(&self.state);
        state.shutdown = false;
        state.wake = false;
    }

    fn wake(&self) {
        lock(&self.state).wake = true;
        self.changed.notify_all();
    }

    fn shutdown(&self) {
        lock(&self.state).shutdown = true;
        self.changed.notify_all();
    }
}

/// State the expiry timer shares with the application. The timer holds a `Weak` reference, so it
/// never keeps the application alive.
struct Inner {
    store: Arc<dyn EventStore>,
    subscribers: Mutex<Vec<(String, Subscriber)>>,
    hooks: Hooks,
    clock: Arc<dyn Clock>,
    logger: Arc<dyn Logger>,
    approver: ActorRef,
    runtime_actor: ActorRef,
    pending: Mutex<BTreeMap<String, PendingAction>>,
    action_results: Mutex<BTreeMap<String, ActionResult>>,
    signal: Arc<Signal>,
}

impl Inner {
    /// Stores an event this application produced, stamps it with the clock and runtime actor,
    /// then notifies subscribers.
    fn emit(&self, mut event: EventEnvelope) {
        event.occurred_at = system_time_to_rfc3339(self.clock.now());
        event.source = Some(self.runtime_actor.clone());
        self.store.append_if_absent(&event);
        self.notify(&event);
    }

    fn notify(&self, event: &EventEnvelope) {
        let name = event.event_type();
        for (event_type, handler) in lock(&self.subscribers).iter() {
            if event_type == name {
                handler(event);
            }
        }
    }

    fn next_deadline(&self) -> Option<SystemTime> {
        lock(&self.pending).values().filter_map(|approval| approval.deadline).min()
    }

    /// Expires every pending approval whose deadline has passed. Each expiry records
    /// `approval.expired`, then `escalation.triggered` targeting the approver, then blocks the action.
    fn expire_approvals(&self) {
        let now = self.clock.now();
        let due: Vec<(String, PendingAction)> = {
            let mut pending = lock(&self.pending);
            let ids: Vec<String> = pending
                .iter()
                .filter(|(_, approval)| approval.deadline.is_some_and(|deadline| deadline <= now))
                .map(|(id, _)| id.clone())
                .collect();
            ids.into_iter()
                .filter_map(|id| pending.remove(&id).map(|approval| (id, approval)))
                .collect()
        };
        for (approval_id, approval) in due {
            let expired = events::approval_expired(&approval_id, APPROVAL_EXPIRED_REASON);
            let expired_id = expired.event_id.clone();
            self.emit(expired);

            let mut escalation = events::escalation_triggered(
                format!("{approval_id}:escalation"),
                &approval.agent,
                &approval.approver,
                APPROVAL_EXPIRED_REASON,
                &approval_id,
            );
            escalation.recipient = Some(approval.approver.clone());
            escalation.channel = approval.event.channel.clone();
            escalation.conversation = approval.event.conversation.clone();
            escalation.correlation_id = approval.event.correlation_id.clone();
            escalation.causation_id = expired_id;
            self.emit(escalation);

            let result = ActionResult::Blocked {
                action_id: approval.action.action_id,
                reason: APPROVAL_EXPIRED_REASON.to_owned(),
            };
            lock(&self.action_results).insert(result.action_id().to_owned(), result);
        }
    }
}

/// Runs expiry until the application stops. It sleeps until the next deadline, or until woken by
/// a change or shutdown. It holds the application only while checking, never while waiting.
fn expiry_loop(inner: Weak<Inner>, signal: Arc<Signal>) {
    loop {
        let wait = {
            let Some(inner) = inner.upgrade() else {
                return;
            };
            inner.expire_approvals();
            inner
                .next_deadline()
                .map(|deadline| deadline.duration_since(inner.clock.now()).unwrap_or_default())
        };
        let mut state = lock(&signal.state);
        if state.shutdown {
            return;
        }
        if !state.wake {
            state = match wait {
                Some(timeout) => {
                    signal
                        .changed
                        .wait_timeout(state, timeout)
                        .unwrap_or_else(PoisonError::into_inner)
                        .0
                }
                None => signal.changed.wait(state).unwrap_or_else(PoisonError::into_inner),
            };
        }
        if state.shutdown {
            return;
        }
        state.wake = false;
    }
}

/// Limits how many conversations are handled at once. A conversation is never handled by two
/// callers at the same time, even when the limit is not reached.
struct Gate {
    limit: usize,
    active: Mutex<HashSet<String>>,
    freed: Condvar,
}

impl Gate {
    fn new(limit: usize) -> Self {
        Self { limit, active: Mutex::new(HashSet::new()), freed: Condvar::new() }
    }

    fn enter(&self, key: String) -> Permit<'_> {
        let mut active = lock(&self.active);
        while active.len() >= self.limit || active.contains(&key) {
            active = self.freed.wait(active).unwrap_or_else(PoisonError::into_inner);
        }
        active.insert(key.clone());
        Permit { gate: self, key }
    }
}

struct Permit<'a> {
    gate: &'a Gate,
    key: String,
}

impl Drop for Permit<'_> {
    fn drop(&mut self) {
        lock(&self.gate.active).remove(&self.key);
        self.gate.freed.notify_all();
    }
}

/// Options for constructing an [`OpenChannel`]. Mirrors the TypeScript and Python SDKs: `policy`
/// and `store` are required; everything else is optional with sensible defaults.
pub struct OpenChannelOptions {
    pub actions: Vec<ActionDefinition>,
    pub agents: Vec<AgentDefinition>,
    pub approval_timeout_ms: u64,
    pub approver: Option<ActorRef>,
    pub channels: Vec<ChannelDefinition>,
    pub clock: Option<Arc<dyn Clock>>,
    pub concurrency: usize,
    pub hooks: Option<Hooks>,
    pub logger: Option<Arc<dyn Logger>>,
    pub policy: Box<dyn ActionPolicy>,
    pub runtime_actor: Option<ActorRef>,
    pub store: Arc<dyn EventStore>,
}

/// An OCP application. Construct one with [`OpenChannel::new`].
pub struct OpenChannel {
    inner: Arc<Inner>,
    host: AgentHost,
    actions: BTreeMap<String, ActionDefinition>,
    channels: Mutex<Vec<ChannelDefinition>>,
    policy: Option<Box<dyn ActionPolicy>>,
    approval_timeout: Duration,
    gate: Gate,
    expiry: Mutex<Option<JoinHandle<()>>>,
}

impl OpenChannel {
    /// Constructs an application from options. `policy` and `store` are required; every other field
    /// falls back to a default.
    pub fn new(options: OpenChannelOptions) -> Result<Self, AgentError> {
        let mut host = AgentHost::new();
        for agent in options.agents {
            host.register(agent)?;
        }
        let mut actions = BTreeMap::new();
        for action in options.actions {
            insert_action(&mut actions, action)?;
        }
        let inner = Inner {
            store: options.store,
            subscribers: Mutex::new(Vec::new()),
            hooks: options.hooks.unwrap_or_default(),
            clock: options.clock.unwrap_or_else(|| Arc::new(SystemClock)),
            logger: options.logger.unwrap_or_else(|| Arc::new(StderrLogger)),
            approver: options.approver.unwrap_or_default(),
            runtime_actor: options.runtime_actor.unwrap_or_else(runtime_actor_default),
            pending: Mutex::new(BTreeMap::new()),
            action_results: Mutex::new(BTreeMap::new()),
            signal: Arc::new(Signal::default()),
        };
        Ok(OpenChannel {
            inner: Arc::new(inner),
            host,
            actions,
            channels: Mutex::new(options.channels),
            policy: Some(options.policy),
            approval_timeout: Duration::from_millis(options.approval_timeout_ms),
            gate: Gate::new(if options.concurrency == 0 {
                usize::MAX
            } else {
                options.concurrency
            }),
            expiry: Mutex::new(None),
        })
    }

    /// Starts channel sources, restores unresolved approvals from the store, expires approvals
    /// already past their deadline, and starts the expiry timer.
    pub fn start(&self) -> Result<(), AgentError> {
        for channel in lock(&self.channels).iter_mut() {
            if let Some(source) = channel.source.as_mut() {
                source.start()?;
            }
        }
        self.restore_approvals()?;
        self.inner.expire_approvals();
        self.start_expiry_timer();
        Ok(())
    }

    /// Stops the expiry timer, waits for it to exit, and closes channels.
    pub fn stop(&self) -> Result<(), AgentError> {
        self.stop_expiry_timer();
        for channel in lock(&self.channels).iter_mut() {
            if let Some(source) = channel.source.as_mut() {
                source.stop()?;
            }
            if let Some(sink) = channel.sink.as_mut() {
                sink.close()?;
            }
        }
        Ok(())
    }

    /// Accepts an event. A duplicate event ID is a no-op and returns an empty result. Events only
    /// the application produces (approval lifecycle, action outcomes, escalations) are rejected, and
    /// so is any event claiming the runtime actor as its source. The application's own writes go
    /// through `emit`, which does not call this. Conversations are handled under the concurrency limit.
    pub fn ingest(&self, event: EventEnvelope) -> Result<HandleResult, AgentError> {
        if APP_PRODUCED_EVENTS.contains(&event.event_type()) {
            return Err(AgentError::Action(format!(
                "{} events are produced only by the app; inbound copies are rejected",
                event.event_type()
            )));
        }
        let runtime_id = &self.inner.runtime_actor.id;
        if !runtime_id.is_empty() && event.source.as_ref().is_some_and(|s| &s.id == runtime_id) {
            return Err(AgentError::Action(format!(
                "inbound events may not claim the runtime actor {runtime_id} as their source"
            )));
        }
        self.inner.expire_approvals();
        let _permit = self.gate.enter(conversation_key(&event));
        if !self.inner.store.append_if_absent(&event) {
            return Ok(HandleResult::default());
        }
        match self.process(&event) {
            Ok(result) => Ok(result),
            Err(error) => {
                self.report(&error);
                Err(error)
            }
        }
    }

    /// Normalizes raw provider input through the provider's source, then ingests each event.
    pub fn receive(
        &self,
        provider: &str,
        input: serde_json::Value,
        metadata: Option<ReceiveMetadata>,
    ) -> Result<Vec<HandleResult>, AgentError> {
        let metadata = metadata.unwrap_or_default();
        let events = {
            let channels = lock(&self.channels);
            let source = channels
                .iter()
                .find(|channel| channel.provider == provider)
                .and_then(|channel| channel.source.as_ref())
                .ok_or_else(|| AgentError::UnknownProvider(provider.to_owned()))?;
            source.normalize(input, &metadata)?
        };
        events.into_iter().map(|event| self.ingest(event)).collect()
    }

    /// Grants a pending approval: records `approval.granted` with `reason`, then runs the held
    /// action. Only the designated approver may decide; anyone else is rejected and the approval
    /// stays pending.
    pub fn approve(
        &self,
        approval_id: &str,
        approver: &ActorRef,
        reason: &str,
    ) -> Result<ActionResult, AgentError> {
        self.inner.expire_approvals();
        let pending = self.take_pending(approval_id, approver)?;
        self.inner.emit(events::approval_decided(
            approval_id,
            ApprovalOutcome::Granted,
            approver,
            reason,
        ));
        let result = self.execute_action(pending.action.clone(), &pending.event)?;
        self.inner.emit(terminal_event(&pending.action, &result));
        lock(&self.inner.action_results).insert(result.action_id().to_owned(), result.clone());
        Ok(result)
    }

    /// Denies a pending approval: records `approval.denied` with `reason`. The held action is
    /// blocked. Only the designated approver may decide.
    pub fn deny(
        &self,
        approval_id: &str,
        approver: &ActorRef,
        reason: &str,
    ) -> Result<ActionResult, AgentError> {
        self.inner.expire_approvals();
        let pending = self.take_pending(approval_id, approver)?;
        self.inner.emit(events::approval_decided(
            approval_id,
            ApprovalOutcome::Denied,
            approver,
            reason,
        ));
        let result = ActionResult::Blocked {
            action_id: pending.action.action_id,
            reason: reason.to_owned(),
        };
        lock(&self.inner.action_results).insert(result.action_id().to_owned(), result.clone());
        Ok(result)
    }

    /// Expires every pending approval whose deadline has passed. The timer does this on its own
    /// while the application runs; call it to force a check.
    pub fn expire_approvals(&self) {
        self.inner.expire_approvals();
    }

    /// Calls `handler` for every event named `event_type`, as it is accepted or emitted.
    pub fn on<F>(&self, event_type: impl Into<String>, handler: F)
    where
        F: Fn(&EventEnvelope) + Send + Sync + 'static,
    {
        lock(&self.inner.subscribers).push((event_type.into(), Box::new(handler)));
    }

    /// The event store, for audit queries.
    pub fn store(&self) -> &dyn EventStore {
        self.inner.store.as_ref()
    }

    pub fn agent_cards(&self) -> Vec<&AgentCard> {
        self.host.agent_cards()
    }

    pub fn add_agent(&mut self, agent: AgentDefinition) -> Result<&mut Self, AgentError> {
        self.host.register(agent)?;
        Ok(self)
    }

    pub fn add_action(&mut self, action: ActionDefinition) -> Result<&mut Self, AgentError> {
        insert_action(&mut self.actions, action)?;
        Ok(self)
    }

    pub fn add_channel(&mut self, channel: ChannelDefinition) -> &mut Self {
        self.channels.get_mut().unwrap_or_else(PoisonError::into_inner).push(channel);
        self
    }

    /// The maximum number of conversations handled at once.
    pub fn concurrency(&self) -> usize {
        self.gate.limit
    }

    fn start_expiry_timer(&self) {
        let mut handle = lock(&self.expiry);
        if handle.is_some() {
            return;
        }
        self.inner.signal.reset();
        let weak = Arc::downgrade(&self.inner);
        let signal = Arc::clone(&self.inner.signal);
        *handle = Some(thread::spawn(move || expiry_loop(weak, signal)));
    }

    fn stop_expiry_timer(&self) {
        let handle = lock(&self.expiry).take();
        self.inner.signal.shutdown();
        if let Some(handle) = handle {
            // The loop only panics if a subscriber panics; the application is stopping either way.
            let _ = handle.join();
        }
    }

    fn process(&self, event: &EventEnvelope) -> Result<HandleResult, AgentError> {
        if let Some(hook) = &self.inner.hooks.on_event_accepted {
            hook(event);
        }
        self.inner.notify(event);
        let mut result = self.host.handle(event, self.inner.logger.as_ref())?;
        for reply in &result.replies {
            self.inner.store.append_if_absent(reply);
            self.inner.notify(reply);
        }
        self.dispatch_replies(&result.replies)?;
        for action in result.actions.clone() {
            let known = lock(&self.inner.action_results).get(&action.action_id).cloned();
            let outcome = match known {
                Some(previous) => previous,
                None => {
                    let resolved = self.resolve_action(action, event)?;
                    lock(&self.inner.action_results)
                        .insert(resolved.action_id().to_owned(), resolved.clone());
                    resolved
                }
            };
            result.action_results.push(outcome);
        }
        if let Some(hook) = &self.inner.hooks.on_event_processed {
            hook(event);
        }
        Ok(result)
    }

    /// Applies policy to one requested action. An approval-required action is held until
    /// [`OpenChannel::approve`], [`OpenChannel::deny`], or expiry resolves it.
    fn resolve_action(
        &self,
        action: ActionInvocation,
        event: &EventEnvelope,
    ) -> Result<ActionResult, AgentError> {
        let decision = self.policy.as_ref().map_or_else(
            || PolicyDecision {
                allowed: false,
                approval_required: false,
                reason: "No policy configured".to_owned(),
            },
            |policy| policy.evaluate(&action, event),
        );
        if !decision.allowed {
            self.inner
                .logger
                .warn(&format!("action {} blocked: {}", action.action_type, decision.reason));
            return Ok(ActionResult::Blocked {
                action_id: action.action_id,
                reason: decision.reason,
            });
        }
        if !decision.approval_required {
            return self.execute_action(action, event);
        }

        let approval_id = format!("{}:approval", action.action_id);
        let deadline = self.inner.clock.now() + self.approval_timeout;
        let agent = event.recipient.clone().unwrap_or_default();
        let approver = self.inner.approver.clone();
        let mut request = events::approval_requested(
            &action,
            &approval_id,
            decision.reason.clone(),
            &agent,
            &approver,
            Some(system_time_to_rfc3339(deadline)),
        );
        request.actor = event.actor.clone();
        request.conversation = event.conversation.clone();
        request.channel = event.channel.clone();
        request.correlation_id = if event.correlation_id.is_empty() {
            event.event_id.clone()
        } else {
            event.correlation_id.clone()
        };
        request.causation_id = event.event_id.clone();

        let action_id = action.action_id.clone();
        self.inner.emit(request.clone());
        lock(&self.inner.pending).insert(
            approval_id.clone(),
            PendingAction { action, agent, approver, event: request, deadline: Some(deadline) },
        );
        self.inner.signal.wake();
        Ok(ActionResult::ApprovalRequired { action_id, approval_id })
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
        if let Some(hook) = &self.inner.hooks.on_action_started {
            hook(&action);
        }
        let action_id = action.action_id.clone();
        let result = match (definition.validator)(&action.input) {
            Err(error) => ActionResult::Failed {
                action_id: action_id.clone(),
                error: ActionError::from_agent_error(action_id, &error),
            },
            Ok(input) => {
                let default_actor = ActorRef::default();
                let context = ActionExecutionContext {
                    actor: event.actor.as_ref().unwrap_or(&default_actor),
                    event,
                };
                match (definition.handler)(&input, &context) {
                    Ok(result) => ActionResult::Executed { action_id, result },
                    Err(error) => ActionResult::Failed {
                        action_id: action_id.clone(),
                        error: ActionError::from_agent_error(action_id, &error),
                    },
                }
            }
        };
        if let Some(hook) = &self.inner.hooks.on_action_completed {
            hook(&result);
        }
        Ok(result)
    }

    /// Takes the pending approval only when `approver` is the designated approver. A mismatch
    /// returns an error and leaves the approval pending.
    fn take_pending(
        &self,
        approval_id: &str,
        approver: &ActorRef,
    ) -> Result<PendingAction, AgentError> {
        let mut pending = lock(&self.inner.pending);
        let designated = pending
            .get(approval_id)
            .ok_or_else(|| AgentError::Action(format!("approval not found: {approval_id}")))?;
        if designated.approver.id.is_empty() || designated.approver.id != approver.id {
            return Err(AgentError::Action(format!(
                "{} is not the designated approver for {approval_id}",
                approver.id
            )));
        }
        pending
            .remove(approval_id)
            .ok_or_else(|| AgentError::Action(format!("approval not found: {approval_id}")))
    }

    /// Rebuilds pending approvals from the store: every `approval.requested` without a decision or
    /// expiry. Only events the runtime produced count (their source is the runtime actor). The
    /// stored input is validated again, and the deadline is kept.
    fn restore_approvals(&self) -> Result<(), AgentError> {
        let runtime = &self.inner.runtime_actor;
        let produced_by_runtime = |event: &EventEnvelope| event.source.as_ref() == Some(runtime);

        // The designated approver id for each stored request, keyed by approval ID.
        let designated: BTreeMap<String, String> = self
            .inner
            .store
            .query_by_type("approval.requested")
            .iter()
            .filter(|request| produced_by_runtime(request))
            .filter_map(|request| match &request.payload {
                EventPayload::ApprovalRequested(payload) => Some((
                    payload.approval_id.clone(),
                    payload.approver.as_ref().map(|actor| actor.id.clone()).unwrap_or_default(),
                )),
                _ => None,
            })
            .collect();

        // A grant or denial resolves a request only when the runtime recorded it AND its approver
        // is the designated one. An expiry resolves a request when the runtime recorded it.
        // Whether a decision event counts: runtime-recorded decisions, or legacy ones whose source
        // is the designated approver (written before decisions were runtime-sourced).
        let counts_as_decision = |event: &EventEnvelope| match &event.payload {
            EventPayload::ApprovalDecided(decision) => {
                let designated_id = designated.get(&decision.approval_id).map(String::as_str);
                let approver_id = decision.approver.as_ref().map(|actor| actor.id.as_str());
                let source_ok = produced_by_runtime(event)
                    || event.source.as_ref().map(|source| source.id.as_str()) == designated_id;
                designated_id.is_some() && designated_id == approver_id && source_ok
            }
            _ => produced_by_runtime(event),
        };
        let resolved: HashSet<String> = ["approval.granted", "approval.denied", "approval.expired"]
            .iter()
            .flat_map(|event_type| self.inner.store.query_by_type(event_type))
            .filter(|event| counts_as_decision(event))
            .filter_map(|event| approval_id_of(&event).map(str::to_owned))
            .collect();
        let granted: HashSet<String> = self
            .inner
            .store
            .query_by_type("approval.granted")
            .into_iter()
            .filter(|event| counts_as_decision(event))
            .filter_map(|event| approval_id_of(&event).map(str::to_owned))
            .collect();
        // Actions whose terminal event (`action.executed` or `action.failed`) is recorded.
        // Only runtime-produced outcomes count. A forged one from another source is ignored, and an
        // event without a readable action identifies nothing, so neither suppresses a grant.
        let finished: HashSet<String> = ["action.executed", "action.failed"]
            .iter()
            .flat_map(|event_type| self.inner.store.query_by_type(event_type))
            .filter(|event| produced_by_runtime(event))
            .filter_map(|event| match &event.payload {
                EventPayload::ActionExecuted(done) => {
                    done.action.as_ref().map(|a| a.action_id.clone())
                }
                EventPayload::ActionFailed(failed) => {
                    failed.action.as_ref().map(|a| a.action_id.clone())
                }
                _ => None,
            })
            .collect();
        // Granted, but the process stopped before the held action finished: these run below.
        let mut unfinished_grants = Vec::new();

        for request in self.inner.store.query_by_type("approval.requested") {
            if !produced_by_runtime(&request) {
                continue;
            }
            let EventPayload::ApprovalRequested(payload) = &request.payload else {
                continue;
            };
            let approval_id = payload.approval_id.clone();
            if lock(&self.inner.pending).contains_key(&approval_id) {
                continue;
            }
            if resolved.contains(&approval_id) {
                if let Some(requested) = payload.requested_action.clone() {
                    if granted.contains(&approval_id) && !finished.contains(&requested.action_id) {
                        unfinished_grants.push((requested, request.clone()));
                    }
                }
                continue;
            }
            let Some(requested) = payload.requested_action.clone() else {
                continue;
            };
            // A stored approval that cannot be restored is reported and skipped; it must not stop
            // the application from starting.
            let Some(definition) = self.actions.get(&requested.action_type) else {
                self.report(&AgentError::UnknownAction(requested.action_type.clone()));
                continue;
            };
            let deadline = match payload.deadline.as_deref().map(rfc3339_to_system_time).transpose()
            {
                Ok(deadline) => deadline,
                Err(error) => {
                    self.report(&AgentError::Action(format!(
                        "approval {approval_id}: unparseable deadline: {error}"
                    )));
                    continue;
                }
            };
            let mut action = requested;
            match (definition.validator)(&action.input) {
                Ok(input) => action.input = input,
                Err(error) => self.inner.logger.error(&format!(
                    "approval {approval_id}: stored input failed validation: {error}"
                )),
            }
            lock(&self.inner.pending).insert(
                approval_id,
                PendingAction {
                    action,
                    agent: payload.agent.clone().unwrap_or_default(),
                    approver: payload.approver.clone().unwrap_or_default(),
                    event: request.clone(),
                    deadline,
                },
            );
        }

        // A grant recorded without a terminal event means the action may not have run. Running it
        // again is at-least-once: an action that ran just before a crash can run twice.
        for (invocation, requested_by) in unfinished_grants {
            match self.execute_action(invocation.clone(), &requested_by) {
                Ok(result) => {
                    self.inner.emit(terminal_event(&invocation, &result));
                    lock(&self.inner.action_results).insert(result.action_id().to_owned(), result);
                }
                Err(error) => self.report(&error),
            }
        }
        Ok(())
    }

    /// Reports a problem that does not stop the application: logs it and calls the error hook.
    fn report(&self, error: &AgentError) {
        self.inner.logger.error(&error.to_string());
        if let Some(hook) = &self.inner.hooks.on_error {
            hook(error);
        }
    }

    fn dispatch_replies(&self, replies: &[EventEnvelope]) -> Result<(), AgentError> {
        for reply in replies {
            let provider =
                reply.channel.as_ref().map(|channel| channel.provider.as_str()).unwrap_or_default();
            let mut channels = lock(&self.channels);
            let channel = channels
                .iter_mut()
                .find(|channel| channel.provider == provider)
                .ok_or_else(|| AgentError::UnknownProvider(provider.to_owned()))?;
            if let Some(sink) = channel.sink.as_mut() {
                let receipt = sink.send(reply)?;
                if let Some(hook) = &self.inner.hooks.on_delivery {
                    hook(&receipt);
                }
            }
        }
        Ok(())
    }
}

impl Drop for OpenChannel {
    fn drop(&mut self) {
        // Signal the timer without joining, so dropping on the timer thread cannot deadlock.
        self.inner.signal.shutdown();
    }
}

/// The approval ID of an approval decision or expiry.
/// The terminal event for a finished action: `action.executed`, or `action.failed` otherwise.
fn terminal_event(action: &ActionInvocation, result: &ActionResult) -> EventEnvelope {
    match result {
        ActionResult::Executed { result, .. } => events::action_executed(action, result.clone()),
        ActionResult::Failed { error, .. } => {
            events::action_failed(action, &error.code, &error.message, error.retryable)
        }
        ActionResult::Blocked { .. } | ActionResult::ApprovalRequired { .. } => {
            events::action_failed(action, "OCP_NOT_EXECUTED", "the action did not run", false)
        }
    }
}

fn approval_id_of(event: &EventEnvelope) -> Option<&str> {
    match &event.payload {
        EventPayload::ApprovalDecided(payload) => Some(&payload.approval_id),
        EventPayload::ApprovalExpired(payload) => Some(&payload.approval_id),
        _ => None,
    }
}

/// Events of one conversation are handled one at a time. Events without a conversation are keyed
/// by correlation or by their own ID.
fn conversation_key(event: &EventEnvelope) -> String {
    let conversation = event.conversation.as_ref().map(|conversation| conversation.id.as_str());
    match conversation {
        Some(id) if !id.is_empty() => id.to_owned(),
        _ if !event.correlation_id.is_empty() => event.correlation_id.clone(),
        _ => event.event_id.clone(),
    }
}

fn insert_action(
    actions: &mut BTreeMap<String, ActionDefinition>,
    action: ActionDefinition,
) -> Result<(), AgentError> {
    if actions.contains_key(&action.action_type) {
        return Err(AgentError::Action(format!(
            "action already registered: {}",
            action.action_type
        )));
    }
    actions.insert(action.action_type.clone(), action);
    Ok(())
}



#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;
    use crate::models::{ActorType, ChannelRef, ChannelSource, ConversationRef};

    fn human(id: &str) -> ActorRef {
        ActorRef { actor_type: ActorType::Human, id: id.to_owned(), ..ActorRef::default() }
    }

    fn finance() -> ActorRef {
        human("human:finance")
    }

    fn inbound(text: &str) -> EventEnvelope {
        let mut event = events::message_received(text);
        event.actor = Some(human("human:gabriel"));
        event.recipient = Some(ActorRef::agent("agent:billing", "Billing"));
        event.source = event.actor.clone();
        event
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

    struct BlockEverything;

    impl ActionPolicy for BlockEverything {
        fn evaluate(&self, _action: &ActionInvocation, _event: &EventEnvelope) -> PolicyDecision {
            PolicyDecision { allowed: false, approval_required: false, reason: "no".to_owned() }
        }
    }

    fn epoch_at(seconds: u64) -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(seconds)
    }

    /// A billing app: refunds need approval from `human:finance`, and each execution is counted.
    fn billing(
        store: Arc<dyn EventStore>,
        clock: Arc<dyn Clock>,
        executions: Arc<AtomicUsize>,
        timeout_ms: u64,
    ) -> OpenChannel {
        OpenChannel::new(OpenChannelOptions {
            policy: Box::new(RequireApprovalPolicy),
            store,
            agents: vec![AgentDefinition::new(
                AgentCard::new("agent:billing", "Billing"),
                |context| {
                    context.request("refund", serde_json::json!({ "amount": 10 }));
                    Ok(())
                },
            )],
            actions: vec![ActionDefinition::new("refund", move |input, _context| {
                executions.fetch_add(1, Ordering::SeqCst);
                Ok(input.clone())
            })],
            channels: vec![],
            approver: Some(finance()),
            approval_timeout_ms: timeout_ms,
            concurrency: usize::MAX,
            hooks: Some(Hooks::default()),
            clock: Some(clock),
            logger: None,
            runtime_actor: Some(runtime_actor_default()),
        })
        .expect("app builds")
    }

    fn approval_id_from(result: &HandleResult) -> String {
        match &result.action_results[0] {
            ActionResult::ApprovalRequired { approval_id, .. } => approval_id.clone(),
            other => panic!("expected approval required, got {other:?}"),
        }
    }

    fn names(store: &dyn EventStore) -> Vec<String> {
        store.events().iter().map(|event| event.event_type().to_owned()).collect()
    }

    #[test]
    fn approval_required_result_keeps_requested_action_id_and_resolves_by_approval_id() {
        let app = billing(
            Arc::new(MemoryEventStore::default()),
            Arc::new(SystemClock),
            Arc::new(AtomicUsize::new(0)),
            60_000,
        );
        app.start().expect("app starts");

        let result = app.ingest(inbound("Refund order 42")).expect("ingested");
        let requested_action_id = result.actions[0].action_id.clone();
        let ActionResult::ApprovalRequired { action_id, approval_id } = &result.action_results[0]
        else {
            panic!("expected approval required");
        };
        assert_eq!(action_id, &requested_action_id);
        assert_eq!(approval_id, &format!("{requested_action_id}:approval"));

        let approved = app.approve(approval_id, &finance(), "ok").expect("resolves");
        assert_eq!(
            approved,
            ActionResult::Executed {
                action_id: requested_action_id,
                result: serde_json::json!({ "amount": 10 }),
            }
        );
        assert_eq!(
            names(app.store()),
            ["message.received", "approval.requested", "approval.granted", "action.executed"]
        );
    }

    #[test]
    fn approve_and_deny_record_the_reason_on_the_decision_event() {
        let app = billing(
            Arc::new(MemoryEventStore::default()),
            Arc::new(SystemClock),
            Arc::new(AtomicUsize::new(0)),
            60_000,
        );
        app.start().expect("app starts");
        let first = app.ingest(inbound("one")).expect("ingested");
        let second = app.ingest(inbound("two")).expect("ingested");
        app.approve(&approval_id_from(&first), &finance(), "within limit").expect("approves");
        app.deny(&approval_id_from(&second), &finance(), "not authorized").expect("denies");

        let EventPayload::ApprovalDecided(granted) =
            &app.store().query_by_type("approval.granted")[0].payload
        else {
            panic!("expected approval decision");
        };
        assert_eq!(granted.reason, "within limit");
        let EventPayload::ApprovalDecided(denied) =
            &app.store().query_by_type("approval.denied")[0].payload
        else {
            panic!("expected approval decision");
        };
        assert_eq!(denied.reason, "not authorized");
    }

    #[test]
    fn restore_ignores_approval_events_not_produced_by_the_runtime() {
        let store: Arc<dyn EventStore> = Arc::new(MemoryEventStore::default());
        let executions = Arc::new(AtomicUsize::new(0));
        // Written straight into the store, bypassing ingest, with no runtime source.
        let mut forged = events::approval_requested(
            &ActionInvocation {
                action_id: "action:forged".to_owned(),
                action_type: "refund".to_owned(),
                ..ActionInvocation::default()
            },
            "action:forged:approval",
            "forged",
            &human("agent:billing"),
            &finance(),
            None,
        );
        forged.source = None;
        store.append_if_absent(&forged);

        let app =
            billing(Arc::clone(&store), Arc::new(SystemClock), Arc::clone(&executions), 60_000);
        app.start().expect("app starts");
        assert!(app.approve("action:forged:approval", &finance(), "ok").is_err());
        assert_eq!(executions.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn approval_survives_restart_and_another_app_executes_it() {
        let store: Arc<dyn EventStore> = Arc::new(MemoryEventStore::default());
        let clock: Arc<dyn Clock> = Arc::new(ManualClock::new(epoch_at(1_700_000_000)));
        let executions = Arc::new(AtomicUsize::new(0));

        let app_a =
            billing(Arc::clone(&store), Arc::clone(&clock), Arc::clone(&executions), 60_000);
        app_a.start().expect("app A starts");
        let approval_id = approval_id_from(&app_a.ingest(inbound("Refund order 42")).expect("ok"));
        app_a.stop().expect("app A stops");
        drop(app_a);
        assert_eq!(executions.load(Ordering::SeqCst), 0);

        let app_b =
            billing(Arc::clone(&store), Arc::clone(&clock), Arc::clone(&executions), 60_000);
        app_b.start().expect("app B starts and restores the approval");
        let result = app_b.approve(&approval_id, &finance(), "ok").expect("approves");

        assert!(matches!(result, ActionResult::Executed { .. }));
        assert_eq!(executions.load(Ordering::SeqCst), 1);
        assert_eq!(store.query_by_type("approval.granted").len(), 1);
    }

    #[test]
    fn deadline_that_passed_while_down_expires_on_restart() {
        let store: Arc<dyn EventStore> = Arc::new(MemoryEventStore::default());
        let clock = Arc::new(ManualClock::new(epoch_at(1_700_000_000)));
        let executions = Arc::new(AtomicUsize::new(0));

        let app_a =
            billing(Arc::clone(&store), clock.clone(), Arc::clone(&executions), 1_000);
        app_a.start().expect("app A starts");
        let approval_id = approval_id_from(&app_a.ingest(inbound("Refund")).expect("ok"));
        app_a.stop().expect("app A stops");

        clock.advance(Duration::from_secs(5));
        let app_b =
            billing(Arc::clone(&store), clock.clone(), Arc::clone(&executions), 1_000);
        app_b.start().expect("app B starts");

        assert_eq!(store.query_by_type("approval.expired").len(), 1);
        assert_eq!(store.query_by_type("escalation.triggered").len(), 1);
        assert!(app_b.approve(&approval_id, &finance(), "late").is_err());
        assert_eq!(executions.load(Ordering::SeqCst), 0);
        app_b.stop().expect("stops");
    }

    #[test]
    fn approval_before_its_deadline_is_still_pending_after_restart() {
        let store: Arc<dyn EventStore> = Arc::new(MemoryEventStore::default());
        let clock = Arc::new(ManualClock::new(epoch_at(1_700_000_000)));
        let executions = Arc::new(AtomicUsize::new(0));

        let app_a =
            billing(Arc::clone(&store), clock.clone(), Arc::clone(&executions), 1_000);
        app_a.start().expect("app A starts");
        let approval_id = approval_id_from(&app_a.ingest(inbound("Refund")).expect("ok"));
        app_a.stop().expect("app A stops");

        let app_b =
            billing(Arc::clone(&store), clock.clone(), Arc::clone(&executions), 60_000);
        app_b.start().expect("app B starts");
        assert!(store.query_by_type("approval.expired").is_empty());
        app_b.approve(&approval_id, &finance(), "ok").expect("still pending");
        app_b.stop().expect("stops");
    }

    #[test]
    fn expiry_emits_approval_expired_then_escalation_targeting_the_approver() {
        let clock = Arc::new(ManualClock::new(epoch_at(1_700_000_000)));
        let app = billing(
            Arc::new(MemoryEventStore::default()),
            clock.clone(),
            Arc::new(AtomicUsize::new(0)),
            1_000,
        );
        app.start().expect("app starts");
        app.ingest(inbound("Refund")).expect("ingested");

        clock.advance(Duration::from_secs(2));
        app.expire_approvals();

        assert_eq!(
            names(app.store()),
            ["message.received", "approval.requested", "approval.expired", "escalation.triggered"]
        );
        let escalation = &app.store().query_by_type("escalation.triggered")[0];
        let EventPayload::EscalationTriggered(payload) = &escalation.payload else {
            panic!("expected escalation");
        };
        assert_eq!(payload.target.as_ref().map(|target| target.id.as_str()), Some("human:finance"));
        assert_eq!(escalation.recipient.as_ref().map(|r| r.id.as_str()), Some("human:finance"));
        assert_eq!(escalation.source.as_ref().map(|s| s.id.as_str()), Some("system:ocp"));
        app.stop().expect("stops");
    }

    #[test]
    fn timer_expires_an_approval_without_any_further_calls() {
        let store: Arc<dyn EventStore> = Arc::new(MemoryEventStore::default());
        let app =
            billing(Arc::clone(&store), Arc::new(SystemClock), Arc::new(AtomicUsize::new(0)), 50);
        app.start().expect("app starts");
        app.ingest(inbound("Refund")).expect("ingested");

        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while store.query_by_type("approval.expired").is_empty() {
            assert!(std::time::Instant::now() < deadline, "the timer never expired the approval");
            thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(store.query_by_type("escalation.triggered").len(), 1);
        app.stop().expect("stops and joins the timer");
    }

    #[test]
    fn stop_then_start_runs_the_timer_again() {
        let store: Arc<dyn EventStore> = Arc::new(MemoryEventStore::default());
        let app =
            billing(Arc::clone(&store), Arc::new(SystemClock), Arc::new(AtomicUsize::new(0)), 50);
        app.start().expect("starts");
        app.stop().expect("stops");
        app.start().expect("restarts");
        app.ingest(inbound("Refund")).expect("ingested");

        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while store.query_by_type("approval.expired").is_empty() {
            assert!(std::time::Instant::now() < deadline, "timer did not run after restart");
            thread::sleep(Duration::from_millis(10));
        }
        app.stop().expect("stops");
    }

    #[test]
    fn duplicate_event_ids_are_ignored() {
        let app = billing(
            Arc::new(MemoryEventStore::default()),
            Arc::new(SystemClock),
            Arc::new(AtomicUsize::new(0)),
            60_000,
        );
        app.start().expect("app starts");
        let event = inbound("Refund order 42");
        let first = app.ingest(event.clone()).expect("ingested");
        let second = app.ingest(event).expect("ingested");
        assert_eq!(first.actions.len(), 1);
        assert!(second.actions.is_empty());
        assert_eq!(app.store().events().len(), 2);
        app.stop().expect("stops");
    }

    #[test]
    fn concurrency_limit_caps_conversations_handled_at_once() {
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let (active_in, peak_in) = (Arc::clone(&active), Arc::clone(&peak));
        let app = OpenChannel::new(OpenChannelOptions {
            agents: vec![AgentDefinition::new(AgentCard::new("agent:billing", "Billing"), move |_| {
                let now = active_in.fetch_add(1, Ordering::SeqCst) + 1;
                peak_in.fetch_max(now, Ordering::SeqCst);
                thread::sleep(Duration::from_millis(30));
                active_in.fetch_sub(1, Ordering::SeqCst);
                Ok(())
            })],
            actions: vec![],
            channels: vec![],
            policy: Box::new(BlockEverything),
            store: Arc::new(MemoryEventStore::default()),
            approver: Some(ActorRef::default()),
            approval_timeout_ms: 60_000,
            concurrency: 1,
            hooks: Some(Hooks::default()),
            clock: None,
            logger: None,
            runtime_actor: Some(runtime_actor_default()),
        })
        .expect("app builds");
        let app = Arc::new(app);
        let handles: Vec<_> = (0..4)
            .map(|index| {
                let app = Arc::clone(&app);
                thread::spawn(move || {
                    let mut event = inbound("hi");
                    event.conversation = Some(ConversationRef {
                        id: format!("conv:{index}"),
                        ..ConversationRef::default()
                    });
                    app.ingest(event).expect("ingested");
                })
            })
            .collect();
        for handle in handles {
            handle.join().expect("thread finishes");
        }
        assert_eq!(peak.load(Ordering::SeqCst), 1);
        assert_eq!(app.concurrency(), 1);
    }

    #[test]
    fn hooks_observe_accepted_events_and_completed_actions() {
        let accepted = Arc::new(AtomicUsize::new(0));
        let completed = Arc::new(AtomicUsize::new(0));
        let (accepted_in, completed_in) = (Arc::clone(&accepted), Arc::clone(&completed));
        let hooks = Hooks {
            on_event_accepted: Some(Box::new(move |_| {
                accepted_in.fetch_add(1, Ordering::SeqCst);
            })),
            on_action_completed: Some(Box::new(move |_| {
                completed_in.fetch_add(1, Ordering::SeqCst);
            })),
            ..Hooks::default()
        };
        let app = OpenChannel::new(OpenChannelOptions {
            policy: Box::new(RequireApprovalPolicy),
            store: Arc::new(MemoryEventStore::default()),
            agents: vec![AgentDefinition::new(AgentCard::new("agent:billing", "Billing"), |context| {
                context.request("refund", serde_json::json!({ "amount": 10 }));
                Ok(())
            })],
            actions: vec![ActionDefinition::new("refund", move |input, _context| {
                Ok(input.clone())
            })],
            channels: vec![],
            approver: Some(finance()),
            approval_timeout_ms: 60_000,
            concurrency: usize::MAX,
            hooks: Some(hooks),
            clock: Some(Arc::new(SystemClock)),
            logger: None,
            runtime_actor: Some(runtime_actor_default()),
        })
        .expect("app builds");
        app.ingest(inbound("Refund")).expect("ingested");
        assert_eq!(accepted.load(Ordering::SeqCst), 1);
        assert_eq!(completed.load(Ordering::SeqCst), 0, "approval is pending, not completed");
    }

    #[derive(Default)]
    struct CapturingLogger {
        warnings: Mutex<Vec<String>>,
    }

    impl Logger for CapturingLogger {
        fn debug(&self, _message: &str) {}
        fn info(&self, _message: &str) {}
        fn warn(&self, message: &str) {
            self.warnings.lock().expect("lock").push(message.to_owned());
        }
        fn error(&self, _message: &str) {}
    }

    #[test]
    fn logger_receives_warnings_for_blocked_actions() {
        let logger = Arc::new(CapturingLogger::default());
        let app = OpenChannel::new(OpenChannelOptions {
            policy: Box::new(BlockEverything),
            store: Arc::new(MemoryEventStore::default()),
            agents: vec![AgentDefinition::new(AgentCard::new("agent:billing", "Billing"), |context| {
                context.request("refund", serde_json::json!({ "amount": 10 }));
                Ok(())
            })],
            actions: vec![ActionDefinition::new("refund", |input, _context| {
                Ok(input.clone())
            })],
            channels: vec![],
            approver: Some(ActorRef::default()),
            approval_timeout_ms: 60_000,
            concurrency: usize::MAX,
            hooks: Some(Hooks::default()),
            clock: Some(Arc::new(SystemClock)),
            logger: Some(logger.clone()),
            runtime_actor: Some(runtime_actor_default()),
        })
        .expect("app builds");
        app.ingest(inbound("Refund")).expect("ingested");
        let warnings = logger.warnings.lock().expect("lock");
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("blocked"));
    }

    struct Echo;

    impl ChannelSource for Echo {
        fn provider(&self) -> &str {
            "echo"
        }

        fn normalize(
            &self,
            input: serde_json::Value,
            metadata: &ReceiveMetadata,
        ) -> Result<Vec<EventEnvelope>, AgentError> {
            let mut event = inbound(input.as_str().unwrap_or_default());
            event.channel = Some(ChannelRef {
                provider: "echo".to_owned(),
                address: metadata.get("from").cloned().unwrap_or_default(),
                ..ChannelRef::default()
            });
            Ok(vec![event])
        }
    }

    #[test]
    fn receive_accepts_optional_metadata() {
        let app = OpenChannel::new(OpenChannelOptions {
            agents: vec![AgentDefinition::new(AgentCard::new("agent:billing", "Billing"), |_| Ok(()))],
            actions: vec![],
            channels: vec![ChannelDefinition {
                provider: "echo".to_owned(),
                source: Some(Box::new(Echo)),
                sink: None,
            }],
            policy: Box::new(BlockEverything),
            store: Arc::new(MemoryEventStore::default()),
            approver: Some(ActorRef::default()),
            approval_timeout_ms: 60_000,
            concurrency: usize::MAX,
            hooks: Some(Hooks::default()),
            clock: None,
            logger: None,
            runtime_actor: Some(runtime_actor_default()),
        })
        .expect("app builds");
        let without = app.receive("echo", serde_json::json!("one"), None).expect("received");
        let with = app
            .receive(
                "echo",
                serde_json::json!("two"),
                Some(ReceiveMetadata::from([("from".to_owned(), "#support".to_owned())])),
            )
            .expect("received");
        assert_eq!(without.len(), 1);
        assert_eq!(with.len(), 1);
        assert!(app.receive("missing", serde_json::json!(""), None).is_err());
    }

    #[test]
    fn exposes_agent_cards_and_adds_agents_after_build() {
        let mut app = OpenChannel::new(OpenChannelOptions {
            agents: vec![AgentDefinition::new(AgentCard::new("agent:triage", "Triage"), |_| Ok(()))],
            actions: vec![],
            channels: vec![],
            policy: Box::new(BlockEverything),
            store: Arc::new(MemoryEventStore::default()),
            approver: Some(ActorRef::default()),
            approval_timeout_ms: 60_000,
            concurrency: usize::MAX,
            hooks: Some(Hooks::default()),
            clock: None,
            logger: None,
            runtime_actor: Some(runtime_actor_default()),
        })
        .expect("app builds");
        assert_eq!(app.agent_cards()[0].name, "Triage");
        app.add_agent(AgentDefinition::new(AgentCard::new("agent:two", "Two"), |_| Ok(())))
            .expect("adds");
        assert_eq!(app.agent_cards().len(), 2);
    }
}
