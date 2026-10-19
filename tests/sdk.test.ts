import { InMemoryChannelAdapter } from "@acp/adapter";
import { RuleBasedPolicyEngine } from "@acp/policy";
import { ChannelRefSchema } from "@acp/protocol";
import { AcpRuntime, ChannelGateway } from "@acp/runtime";
import { createTestAgent, createTestEvent, createTestHuman } from "@acp/testing";
import { create } from "@bufbuild/protobuf";
import { AgentHost } from "acp-sdk";
import { describe, expect, it } from "vitest";

describe("ACP agent SDK", () => {
  it("routes an inbound message and dispatches the agent reply", async () => {
    const adapter = new InMemoryChannelAdapter();
    const runtime = new AcpRuntime({
      policy: new RuleBasedPolicyEngine({ rules: [] }),
    });
    const gateway = new ChannelGateway(runtime, [adapter]);
    const host = new AgentHost({ gateway, runtime });
    const human = createTestHuman("human:gabriel", "Gabriel");
    const agent = createTestAgent("agent:support", "Support Agent");

    host.register({
      id: agent.id,
      name: agent.displayName,
      onMessage: async (context) => {
        await context.reply(`Received: ${context.message.text}`);
      },
      skills: [{ id: "support", name: "Support" }],
    });
    expect(host.getAgentCard(agent.id)?.skills[0]?.id).toBe("support");
    host.attach();

    const inbound = createTestEvent({
      actor: human,
      channel: create(ChannelRefSchema, { channelId: "channel-1", provider: "memory" }),
      recipient: agent,
      text: "Can you help?",
    });

    await runtime.process(inbound);

    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0].eventType).toBe("message.sent");
    if (adapter.sent[0].payload.case === "messageSent") {
      expect(adapter.sent[0].payload.value.text).toBe("Received: Can you help?");
    }
  });
});
