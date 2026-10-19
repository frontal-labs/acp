import { InMemoryChannelAdapter } from "@acp/adapter";
import { RuleBasedPolicyEngine } from "@acp/policy";
import { AcpRuntime, ChannelGateway } from "@acp/runtime";
import { createTestAgent, createTestEvent, createTestHuman } from "@acp/testing";
import { AgentHost } from "acp-sdk";

export type TextAgent = (text: string) => string | Promise<string>;

/** Runs a text harness behind a real ACP AgentHost and memory channel. */
export async function runAcpTextAgent(name: string, handler: TextAgent): Promise<void> {
  const adapter = new InMemoryChannelAdapter();
  const runtime = new AcpRuntime({ policy: new RuleBasedPolicyEngine({ rules: [] }) });
  const gateway = new ChannelGateway(runtime, [adapter]);
  const host = new AgentHost({ gateway, runtime });
  const agent = createTestAgent(`agent:${name}`, name);

  host.register({
    description: `ACP bridge for ${name}`,
    id: agent.id,
    name: agent.displayName,
    onMessage: async (context) => {
      await context.reply(await handler(context.message.text));
    },
    skills: [{ id: "respond", name: "Respond to an ACP message" }],
  });
  host.attach();

  await runtime.process(
    createTestEvent({
      actor: createTestHuman("human:example", "Example User"),
      eventType: "message.received",
      recipient: agent,
      text: "Explain why ACP keeps policy outside the model prompt.",
    }),
  );

  const [reply] = adapter.sent;
  if (reply?.payload.case !== "messageSent") {
    throw new Error("The ACP bridge did not dispatch a message.sent reply");
  }

  console.log(
    JSON.stringify(
      {
        agentCard: host.getAgentCard(agent.id),
        correlationId: reply.correlationId,
        eventType: reply.eventType,
        reply: reply.payload.value.text,
      },
      null,
      2,
    ),
  );
}
