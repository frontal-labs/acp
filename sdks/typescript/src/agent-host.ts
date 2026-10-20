import { AcpError, ActionError, ConflictError } from "@acp/core";
import {
  ActorRefSchema,
  ActorType,
  createEvent,
  type EventEnvelope,
  type MessageReceived,
  MessageSentSchema,
} from "@acp/protocol";
import { create } from "@bufbuild/protobuf";

import type {
  ActionRequestOptions,
  ActionResult,
  AgentActionInput,
  AgentCard,
  AgentContext,
  AgentDefinition,
  AgentHostOptions,
  ReplyOptions,
} from "./types.js";

/** Hosts discoverable agents and routes ACP channel messages to them. */
export class AgentHost {
  private readonly runtime: AgentHostOptions["runtime"];
  private readonly gateway: AgentHostOptions["gateway"];
  private readonly actionRequester: AgentHostOptions["actionRequester"];
  private readonly onDelivery: AgentHostOptions["onDelivery"];
  private readonly onError: AgentHostOptions["onError"];
  private readonly maxConcurrentConversations: number;
  private readonly agents: Record<string, AgentDefinition> = Object.create(null);
  private readonly queues: Partial<Record<string, Promise<void>>> = Object.create(null);
  private runningConversations = 0;
  private readonly concurrencyWaiters: Array<() => void> = [];
  private detachSubscription?: () => void;

  constructor(options: AgentHostOptions) {
    this.runtime = options.runtime;
    this.gateway = options.gateway;
    this.actionRequester = options.actionRequester;
    this.onDelivery = options.onDelivery;
    this.onError = options.onError;
    this.maxConcurrentConversations = Math.max(
      1,
      options.maxConcurrentConversations ?? Number.POSITIVE_INFINITY,
    );
    for (const agent of options.agents ?? []) {
      this.register(agent);
    }
  }

  register(agent: AgentDefinition): this {
    if (agent.id in this.agents) {
      throw new ConflictError("ACP agent", agent.id);
    }
    this.agents[agent.id] = agent;
    return this;
  }

  unregister(agentId: string): boolean {
    if (!(agentId in this.agents)) {
      return false;
    }
    delete this.agents[agentId];
    return true;
  }

  getAgent(agentId: string): AgentDefinition | undefined {
    const agent: AgentDefinition | undefined = this.agents[agentId];
    return agent;
  }

  getAgentCard(agentId: string): AgentCard | undefined {
    const agent = this.getAgent(agentId);
    return agent ? this.toCard(agent) : undefined;
  }

  listAgentCards(): AgentCard[] {
    return Object.values(this.agents).map((agent) => this.toCard(agent));
  }

  attach(): () => void {
    if (this.detachSubscription) {
      return this.detachSubscription;
    }
    const unsubscribe = this.runtime.subscribe(async (event) => {
      try {
        await this.handle(event);
      } catch (error) {
        await this.onError?.(
          error instanceof AcpError
            ? error
            : new AcpError("ACP_ACTION", error instanceof Error ? error.message : String(error), {
                cause: error,
                eventId: event.eventId,
                stage: "processing",
              }),
        );
      }
    });
    this.detachSubscription = () => {
      unsubscribe();
      this.detachSubscription = undefined;
    };
    return this.detachSubscription;
  }

  detach(): void {
    this.detachSubscription?.();
  }

  async handle(event: EventEnvelope): Promise<boolean> {
    if (event.eventType !== "message.received" || event.payload.case !== "messageReceived") {
      return false;
    }
    const message = event.payload.value;
    const key = this.conversationKey(event);
    const previous = this.queues[key] ?? Promise.resolve();
    const current = previous.then(() => this.handleNow(event, message));
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.queues[key] = tail;
    try {
      return await current;
    } finally {
      if (this.queues[key] === tail) {
        delete this.queues[key];
      }
    }
  }

  async waitForIdle(): Promise<void> {
    await Promise.allSettled(Object.values(this.queues));
  }

  private async handleNow(event: EventEnvelope, message: MessageReceived): Promise<boolean> {
    const agentId = event.recipient?.id;
    const definition: AgentDefinition | undefined = agentId ? this.agents[agentId] : undefined;
    if (!definition) {
      return false;
    }
    const agent = this.toActor(definition);
    await this.acquireConversation();
    try {
      const actions = {
        request: <TInput, TResult = unknown>(
          type: string,
          input: TInput,
          options?: ActionRequestOptions,
        ): Promise<ActionResult<TResult>> => {
          if (!this.actionRequester) {
            return Promise.reject(
              new ActionError("ACP action handling is not configured for this host"),
            );
          }
          return this.actionRequester(agent, event, type, input, options);
        },
      };
      const context: AgentContext = {
        actions,
        actor: agent,
        agent,
        channel: event.channel,
        conversation: event.conversation,
        conversationId: event.conversation?.id,
        event,
        hooks: { onError: (error) => this.onError?.(error) },
        logger: {
          debug: () => undefined,
          error: () => undefined,
          info: () => undefined,
          warn: () => undefined,
        },
        message,
        rawEvent: event,
        recipient: event.recipient,
        reply: (text, options) => this.reply(agent, event, text, options),
        requestAction: (input) => this.requestAction(agent, event, input),
        runtime: this.runtime,
      };
      await definition.onMessage(context, message);
      return true;
    } finally {
      this.releaseConversation();
    }
  }

  private async reply(
    agent: ReturnType<AgentHost["toActor"]>,
    inbound: EventEnvelope,
    text: string,
    options: ReplyOptions = {},
  ): Promise<EventEnvelope> {
    const event = createEvent({
      actor: agent,
      causationId: inbound.eventId,
      channel: options.channel ?? inbound.channel,
      conversation: options.conversation ?? inbound.conversation,
      correlationId: inbound.correlationId || inbound.eventId,
      eventType: "message.sent",
      payload: {
        case: "messageSent",
        value: create(MessageSentSchema, { text }),
      },
      recipient: options.recipient ?? inbound.actor,
      source: agent,
    });
    await this.runtime.process(event);
    if (this.gateway) {
      const receipt = await this.gateway.dispatch(event);
      if (receipt) {
        await this.onDelivery?.(receipt);
      }
    }
    return event;
  }

  private requestAction(
    agent: ReturnType<AgentHost["toActor"]>,
    inbound: EventEnvelope,
    input: AgentActionInput,
  ) {
    if (this.actionRequester && input.action) {
      return this.actionRequester(agent, inbound, input.action.type, input.action, {
        approver: input.approver,
        channel: input.channel,
        conversation: input.conversation,
        deadline: input.deadline,
        reason: input.reason,
        recipient: input.recipient,
        target: input.action.target,
      }).then((result) => {
        if (result.status === "blocked") {
          return {
            decision: {
              allowed: false,
              approvalRequired: false,
              policyId: "action-registry",
              reason: result.reason,
            },
            events: [],
            status: "blocked" as const,
          };
        }
        if (result.status === "approval_required") {
          return {
            approvalId: result.approvalId,
            decision: {
              allowed: true,
              approvalRequired: true,
              policyId: "action-registry",
              reason: "Approval required",
            },
            events: [],
            status: "approval_required" as const,
          };
        }
        return {
          decision: {
            allowed: true,
            approvalRequired: false,
            policyId: "action-registry",
            reason: "Action executed",
          },
          events: [],
          status: "authorized" as const,
        };
      });
    }
    return this.runtime.submitAction({
      ...input,
      actor: agent,
      channel: input.channel ?? inbound.channel,
      conversation: input.conversation ?? inbound.conversation,
    });
  }

  private toActor(definition: AgentDefinition) {
    return create(ActorRefSchema, {
      capabilities: definition.actorCapabilities ?? [],
      displayName: definition.name,
      id: definition.id,
      type: ActorType.AGENT,
    });
  }

  private acquireConversation(): Promise<void> {
    if (this.runningConversations < this.maxConcurrentConversations) {
      this.runningConversations += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.concurrencyWaiters.push(() => {
        this.runningConversations += 1;
        resolve();
      });
    });
  }

  private releaseConversation(): void {
    const next = this.concurrencyWaiters.shift();
    if (next) {
      next();
    } else {
      this.runningConversations = Math.max(0, this.runningConversations - 1);
    }
  }

  private conversationKey(event: EventEnvelope): string {
    if (event.conversation?.id) {
      return `conversation:${event.conversation.id}`;
    }
    if (event.channel?.provider && event.channel.channelId) {
      return `channel:${event.channel.provider}:${event.channel.channelId}:${event.channel.threadId}`;
    }
    return `event:${event.eventId}`;
  }

  private toCard(definition: AgentDefinition): AgentCard {
    return {
      capabilities: definition.capabilities ?? {},
      description: definition.description,
      id: definition.id,
      name: definition.name,
      skills: definition.skills ?? [],
      url: definition.url,
      version: definition.version,
    };
  }
}
