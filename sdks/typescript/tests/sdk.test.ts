import { ActorType, ChannelRefSchema } from "@acp/protocol";
import {
  createTestAgent,
  createTestConversation,
  createTestEvent,
  createTestHuman,
} from "@acp/testing";
import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { InMemoryChannelAdapter } from "../../../packages/adapter/src/index.js";
import { RuleBasedPolicyEngine } from "../../../packages/policy/src/index.js";
import { AcpRuntime, ChannelGateway } from "../../../packages/runtime/src/index.js";
import { AgentHost, createAcp, defineAction } from "../src/index.js";

describe("acp-sdk", () => {
  it("routes a message to an agent and dispatches its reply", async () => {
    const adapter = new InMemoryChannelAdapter();
    const runtime = new AcpRuntime({ policy: new RuleBasedPolicyEngine({ rules: [] }) });
    const gateway = new ChannelGateway(runtime, [adapter]);
    const host = new AgentHost({ gateway, runtime });
    const agent = createTestAgent("agent:sdk", "SDK Agent");

    host.register({
      id: agent.id,
      name: agent.displayName,
      onMessage: async (context) => {
        await context.reply(`Echo: ${context.message.text}`);
      },
      skills: [{ id: "echo", name: "Echo" }],
    });
    host.attach();

    await runtime.process(
      createTestEvent({
        actor: createTestHuman(),
        channel: create(ChannelRefSchema, { channelId: "channel:sdk", provider: "memory" }),
        eventType: "message.received",
        recipient: agent,
        text: "hello",
      }),
    );

    expect(host.getAgentCard(agent.id)?.skills[0]?.id).toBe("echo");
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]?.payload.case).toBe("messageSent");
    expect(agent.type).toBe(ActorType.AGENT);
  });

  it("builds an application with typed actions and lifecycle management", async () => {
    const adapter = new InMemoryChannelAdapter();
    const executed: number[] = [];
    const agent = createTestAgent("agent:app", "App Agent");
    const human = createTestHuman("human:app", "App Human");
    const increment = defineAction<{ value: number }, number>({
      execute: (input) => {
        executed.push(input.value);
        return input.value + 1;
      },
      type: "counter.increment",
      validate: (input: unknown) => {
        if (!input || typeof input !== "object" || !("value" in input)) {
          throw new Error("value is required");
        }
        return input as { value: number };
      },
    });
    const app = createAcp({
      actions: [increment],
      agents: [
        {
          id: agent.id,
          name: agent.displayName,
          onMessage: async (context) => {
            await context.actions.request("counter.increment", { value: 2 });
            await context.reply("done");
          },
        },
      ],
      channels: [{ provider: "memory", sink: adapter }],
      policy: new RuleBasedPolicyEngine({
        rules: [{ actionType: "counter.increment", allowed: true, id: "counter" }],
      }),
    });

    await app.start();
    await app.ingest(
      createTestEvent({
        actor: human,
        channel: create(ChannelRefSchema, { channelId: "channel:app", provider: "memory" }),
        conversation: undefined,
        recipient: agent,
      }),
    );
    await app.stop();

    expect(executed).toEqual([2]);
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]?.eventType).toBe("message.sent");
  });

  it("executes a registered action only after approval", async () => {
    const agent = createTestAgent("agent:approval", "Approval Agent");
    const approver = createTestHuman("human:approver", "Approver");
    let executions = 0;
    let approvalId = "";
    const app = createAcp({
      actions: [
        {
          execute: () => {
            executions += 1;
            return "updated";
          },
          type: "sensitive.update",
          validate: (input: unknown) => input,
        },
      ],
      agents: [
        {
          id: agent.id,
          name: agent.displayName,
          onMessage: async (context) => {
            const result = await context.actions.request(
              "sensitive.update",
              {},
              {
                approver,
                reason: "Needs review",
              },
            );
            if (result.status === "approval_required") {
              ({ approvalId } = result);
            }
          },
        },
      ],
      policy: new RuleBasedPolicyEngine({
        rules: [
          {
            actionType: "sensitive.update",
            allowed: true,
            id: "review",
            requiresApproval: true,
          },
        ],
      }),
    });

    await app.start();
    await app.ingest(createTestEvent({ actor: createTestHuman(), recipient: agent }));
    expect(executions).toBe(0);
    expect(approvalId).toBeTruthy();

    await app.approve(approvalId, approver);
    await app.stop();

    expect(executions).toBe(1);
  });

  it("normalizes source input, deduplicates intake, and preserves raw context", async () => {
    const adapter = new InMemoryChannelAdapter();
    const sourceEvents: string[] = [];
    const agent = createTestAgent("agent:source", "Source Agent");
    const inbound = createTestEvent({ eventId: "source-event", recipient: agent });
    const source = {
      normalize: async () => inbound,
      provider: "memory",
      start: () => {
        sourceEvents.push("started");
      },
      stop: () => {
        sourceEvents.push("stopped");
      },
    };
    let rawEvent: unknown;
    const app = createAcp({
      agents: [
        {
          id: agent.id,
          name: agent.displayName,
          onMessage: async (context) => {
            ({ rawEvent } = context);
            await context.reply("source reply", { recipient: context.actor });
          },
        },
      ],
      channels: [{ provider: "memory", sink: adapter, source }],
      policy: new RuleBasedPolicyEngine({ rules: [] }),
    });

    await app.start();
    const first = await app.receive("memory", { message: "hello" });
    const second = await app.receive("memory", { message: "hello again" });
    await app.stop();

    expect(first[0]?.duplicate).toBe(false);
    expect(second[0]?.duplicate).toBe(true);
    expect(rawEvent).toBe(inbound);
    expect(adapter.sent).toHaveLength(1);
    expect(sourceEvents).toEqual(["started", "stopped"]);
  });

  it("executes an action id at most once and audits failures", async () => {
    const agent = createTestAgent("agent:duplicate", "Duplicate Agent");
    const human = createTestHuman("human:duplicate");
    let executions = 0;
    const app = createAcp({
      actions: [
        {
          execute: () => {
            executions += 1;
            throw new Error("provider unavailable");
          },
          type: "duplicate.action",
          validate: (input: unknown) => input,
        },
      ],
      agents: [
        {
          id: agent.id,
          name: agent.displayName,
          onMessage: async (context) => {
            const first = await context.actions.request(
              "duplicate.action",
              {},
              {
                actionId: "action:once",
              },
            );
            const second = await context.actions.request(
              "duplicate.action",
              {},
              {
                actionId: "action:once",
              },
            );
            expect(first.status).toBe("failed");
            expect(second.status).toBe("failed");
          },
        },
      ],
      policy: new RuleBasedPolicyEngine({
        rules: [{ actionType: "duplicate.action", allowed: true, id: "allow" }],
      }),
    });

    await app.start();
    await app.ingest(createTestEvent({ actor: human, recipient: agent }));
    await app.stop();

    expect(executions).toBe(1);
    expect(await app.runtime.queryEvents({ eventType: "action.failed" })).toHaveLength(1);
  });

  it("serializes work in one conversation while allowing another conversation to run", async () => {
    const agent = createTestAgent("agent:concurrency", "Concurrency Agent");
    let active = 0;
    let peak = 0;
    const release = new Map<string, () => void>();
    const app = createAcp({
      agents: [
        {
          id: agent.id,
          name: agent.displayName,
          onMessage: async (context) => {
            active += 1;
            peak = Math.max(peak, active);
            await new Promise<void>((resolve) => release.set(context.event.eventId, resolve));
            active -= 1;
          },
        },
      ],
      concurrency: { maxConcurrentConversations: 2 },
      policy: new RuleBasedPolicyEngine({ rules: [] }),
    });
    await app.start();
    const first = createTestEvent({
      conversation: createTestConversation("conversation:serial"),
      eventId: "serial-1",
      recipient: agent,
    });
    const second = createTestEvent({
      conversation: createTestConversation("conversation:serial"),
      eventId: "serial-2",
      recipient: agent,
    });
    const third = createTestEvent({
      conversation: createTestConversation("conversation:parallel"),
      eventId: "parallel-1",
      recipient: agent,
    });
    const firstRun = app.ingest(first);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const secondRun = app.ingest(second);
    const thirdRun = app.ingest(third);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(peak).toBe(2);
    release.get("serial-1")?.();
    release.get("parallel-1")?.();
    await Promise.all([firstRun, thirdRun]);
    release.get("serial-2")?.();
    await secondRun;
    await app.stop();
  });
});
