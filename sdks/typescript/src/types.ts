import type { ChannelSink, ChannelSource, DeliveryReceipt } from "@acp/adapter";
import type { PolicyEngine } from "@acp/policy";
import type { ActorRef, EventEnvelope, MessageReceived } from "@acp/protocol";
import type {
  AcpRuntime,
  ChannelGateway,
  Clock,
  EventStore,
  RuntimeResult,
  SubmitActionInput,
  SubmitActionResult,
} from "@acp/runtime";

/** Declarative agent registration used to build an A2A-like agent card. */
export interface AgentDefinition {
  actorCapabilities?: string[];
  capabilities?: AgentCapabilities;
  description?: string;
  id: string;
  name: string;
  onMessage: (context: AgentContext, message: MessageReceived) => void | Promise<void>;
  skills?: AgentSkill[];
  url?: string;
  version?: string;
}

/** Capabilities advertised by an agent host. */
export interface AgentCapabilities {
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
  streaming?: boolean;
}

/** A discoverable agent skill. */
export interface AgentSkill {
  description?: string;
  examples?: string[];
  id: string;
  name: string;
  tags?: string[];
}

/** Portable discovery metadata for an ACP agent. */
export interface AgentCard {
  capabilities: AgentCapabilities;
  description?: string;
  id: string;
  name: string;
  skills: AgentSkill[];
  url?: string;
  version?: string;
}

/** Context supplied to an agent when it receives a channel message. */
export interface AgentContext {
  actions: AgentActions;
  agent: ActorRef;
  conversationId?: string;
  event: EventEnvelope;
  message: MessageReceived;
  reply: (text: string) => Promise<EventEnvelope>;
  requestAction: (input: AgentActionInput) => Promise<SubmitActionResult>;
  runtime: AcpRuntime;
}

/** Ergonomic action API exposed to high-level agent handlers. */
export interface AgentActions {
  request: <TInput, TResult = unknown>(
    type: string,
    input: TInput,
    options?: ActionRequestOptions,
  ) => Promise<ActionResult<TResult>>;
}

/** Context supplied to a registered action handler. */
export interface ActionExecutionContext {
  actor: ActorRef;
  event?: EventEnvelope;
  runtime: AcpRuntime;
}

type ActionExecutor<TInput, TResult> = {
  // biome-ignore lint/style/useConsistentMethodSignatures: Typed definitions enter an erased registry through this bivariant boundary.
  bivarianceHack(input: TInput, context: ActionExecutionContext): TResult | Promise<TResult>;
}["bivarianceHack"];

/** A registered, policy-controlled action implementation. */
export interface ActionDefinition<TInput, TResult> {
  execute: ActionExecutor<TInput, TResult>;
  type: string;
  validate?: (input: unknown) => TInput;
}

/** Defines an action while preserving its input and result types for the app registry. */
export function defineAction<TInput, TResult>(
  action: ActionDefinition<TInput, TResult>,
): ActionDefinition<TInput, TResult> {
  return action;
}

/** Optional routing and approval details for an action request. */
export interface ActionRequestOptions {
  actionId?: string;
  approver?: ActorRef;
  channel?: SubmitActionInput["channel"];
  conversation?: SubmitActionInput["conversation"];
  deadline?: Date;
  reason?: string;
  recipient?: ActorRef;
  target?: string;
}

/** Result of a high-level action request. */
export type ActionResult<TResult> =
  | { actionId: string; status: "blocked"; reason: string }
  | { actionId: string; status: "approval_required"; approvalId: string }
  | { actionId: string; status: "executed"; result: TResult }
  | { actionId: string; status: "failed"; error: unknown };

/** Action input that is completed with the current agent and conversation. */
export type AgentActionInput = Omit<
  SubmitActionInput,
  "actor" | "channel" | "conversation"
> & {
  channel?: SubmitActionInput["channel"];
  conversation?: SubmitActionInput["conversation"];
};

/** Dependencies used to construct an agent host. */
export interface AgentHostOptions {
  actionRequester?: <TInput, TResult>(
    agent: ActorRef,
    inbound: EventEnvelope,
    type: string,
    input: TInput,
    options?: ActionRequestOptions,
  ) => Promise<ActionResult<TResult>>;
  agents?: AgentDefinition[];
  gateway?: ChannelGateway;
  onDelivery?: (receipt: DeliveryReceipt) => void | Promise<void>;
  runtime: AcpRuntime;
}

/** Provider registration used by the high-level app facade. */
export interface ChannelDefinition {
  provider: string;
  sink?: ChannelSink;
  source?: ChannelSource;
}

/** Vendor-neutral lifecycle and delivery hooks. */
export interface AcpHooks {
  onActionCompleted?: (result: ActionResult<unknown>) => void | Promise<void>;
  onActionStarted?: (action: string, actionId: string) => void | Promise<void>;
  onDelivery?: (receipt: DeliveryReceipt) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  onEventAccepted?: (event: EventEnvelope) => void | Promise<void>;
  onEventProcessed?: (event: EventEnvelope) => void | Promise<void>;
}

/** Configuration for the config-first ACP application facade. */
export interface AcpAppOptions {
  actions?: ActionDefinition<unknown, unknown>[];
  agents?: AgentDefinition[];
  channels?: ChannelDefinition[];
  clock?: Clock;
  defaultApprovalTimeoutMs?: number;
  defaultApprover?: ActorRef;
  eventStore?: EventStore;
  hooks?: AcpHooks;
  policy: PolicyEngine;
  runtimeActor?: ActorRef;
}

/** Lifecycle-managed ACP application facade. */
export interface AcpApp {
  approve: (approvalId: string, approver: ActorRef, reason?: string) => Promise<RuntimeResult>;
  deny: (approvalId: string, approver: ActorRef, reason?: string) => Promise<RuntimeResult>;
  readonly gateway: ChannelGateway;
  ingest: (event: EventEnvelope) => Promise<RuntimeResult>;
  listAgentCards: () => AgentCard[];
  on: (
    eventType: string,
    handler: (event: EventEnvelope) => void | Promise<void>,
  ) => () => void;
  receive: (
    provider: string,
    input: unknown,
    metadata?: import("@acp/adapter").ReceiveMetadata,
  ) => Promise<RuntimeResult[]>;
  registerAction: <TInput, TResult>(action: ActionDefinition<TInput, TResult>) => void;
  registerAgent: (agent: AgentDefinition) => void;
  registerChannel: (channel: ChannelDefinition) => void;
  readonly runtime: AcpRuntime;
  start: () => Promise<void>;
  stop: (options?: { timeoutMs?: number }) => Promise<void>;
}
