import { ActorType, ChannelRefSchema } from "@acp/protocol";
import { createTestAgent, createTestEvent, createTestHuman } from "@acp/testing";
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
});
