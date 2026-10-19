import { ConflictError } from "@acp/core";
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
} from "./types.js";

/** Hosts discoverable agents and routes ACP channel messages to them. */
export class AgentHost {
  private readonly runtime: AgentHostOptions["runtime"];
  private readonly gateway: AgentHostOptions["gateway"];
  private readonly actionRequester: AgentHostOptions["actionRequester"];
  private readonly onDelivery: AgentHostOptions["onDelivery"];
  private readonly agents = new Map<string, AgentDefinition>();
  private readonly queues = new Map<string, Promise<void>>();
  private detachSubscription?: () => void;

  constructor(options: AgentHostOptions) {
    this.runtime = options.runtime;
    this.gateway = options.gateway;
    this.actionRequester = options.actionRequester;
    this.onDelivery = options.onDelivery;
    for (const agent of options.agents ?? []) {
      this.register(agent);
    }
  }

  register(agent: AgentDefinition): this {
    if (this.agents.has(agent.id)) {
      throw new ConflictError("ACP agent", agent.id);
    }
    this.agents.set(agent.id, agent);
    return this;
  }

  unregister(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  getAgent(agentId: string): AgentDefinition | undefined {
    return this.agents.get(agentId);
  }

  getAgentCard(agentId: string): AgentCard | undefined {
    const agent = this.getAgent(agentId);
    return agent ? this.toCard(agent) : undefined;
  }

  listAgentCards(): AgentCard[] {
    return [...this.agents.values()].map((agent) => this.toCard(agent));
  }

  attach(): () => void {
    if (this.detachSubscription) {
      return this.detachSubscription;
    }
    const unsubscribe = this.runtime.subscribe((event) => this.handle(event).then(() => undefined));
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
    const previous = this.queues.get(key) ?? Promise.resolve();
    const current = previous.then(() => this.handleNow(event, message));
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(key, tail);
    try {
      return await current;
    } finally {
      if (this.queues.get(key) === tail) {
        this.queues.delete(key);
      }
    }
  }

  async waitForIdle(): Promise<void> {
    await Promise.allSettled(this.queues.values());
  }

  private async handleNow(event: EventEnvelope, message: MessageReceived): Promise<boolean> {
    const agentId = event.recipient?.id;
    const definition = agentId ? this.agents.get(agentId) : undefined;
    if (!definition) {
      return false;
    }
    const agent = this.toActor(definition);
    const context: AgentContext = {
      actions: {
        request: <TInput, TResult = unknown>(
          type: string,
          input: TInput,
          options?: ActionRequestOptions,
        ): Promise<ActionResult<TResult>> => {
          if (!this.actionRequester) {
            return Promise.reject(new Error("ACP action handling is not configured for this host"));
          }
          return this.actionRequester(agent, event, type, input, options);
        },
      },
      agent,
      conversationId: event.conversation?.id,
      event,
      message,
      reply: (text) => this.reply(agent, event, text),
      requestAction: (input) => this.requestAction(agent, event, input),
      runtime: this.runtime,
    };
    await definition.onMessage(context, message);
    return true;
  }

  private async reply(
    agent: ReturnType<AgentHost["toActor"]>,
    inbound: EventEnvelope,
    text: string,
  ): Promise<EventEnvelope> {
    const event = createEvent({
      actor: agent,
      causationId: inbound.eventId,
      channel: inbound.channel,
      conversation: inbound.conversation,
      correlationId: inbound.correlationId || inbound.eventId,
      eventType: "message.sent",
      payload: {
        case: "messageSent",
        value: create(MessageSentSchema, { text }),
      },
      recipient: inbound.actor,
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
