import { InMemoryChannelAdapter } from "@acp/adapter";
import { RuleBasedPolicyEngine } from "@acp/policy";
import { createTestAgent, createTestEvent, createTestHuman } from "@acp/testing";
import { createAcp } from "acp-sdk";

export type TextAgent = (text: string) => string | Promise<string>;

/** Runs a text harness behind the high-level ACP application API. */
export async function runAcpTextAgent(name: string, handler: TextAgent): Promise<void> {
  const adapter = new InMemoryChannelAdapter();
  const agent = createTestAgent(`agent:${name}`, name);
  const inbound = createTestEvent({
    actor: createTestHuman("human:example", "Example User"),
    eventType: "message.received",
    recipient: agent,
    text: "Explain why ACP keeps policy outside the model prompt.",
  });
  const app = createAcp({
    agents: [
      {
        description: `ACP bridge for ${name}`,
        id: agent.id,
        name: agent.displayName,
        onMessage: async (context) => {
          await context.reply(await handler(context.message.text));
        },
        skills: [{ id: "respond", name: "Respond to an ACP message" }],
      },
    ],
    channels: [
      {
        provider: "memory",
        sink: adapter,
        source: { normalize: async () => inbound, provider: "memory" },
      },
    ],
    policy: new RuleBasedPolicyEngine({ rules: [] }),
  });

  await app.start();
  await app.receive("memory", inbound);

  const [reply] = adapter.sent;
  if (reply?.payload.case !== "messageSent") {
    throw new Error("The ACP bridge did not dispatch a message.sent reply");
  }

  console.log(
    JSON.stringify(
      {
        agentCard: app.listAgentCards().find((card) => card.id === agent.id),
        correlationId: reply.correlationId,
        eventType: reply.eventType,
        reply: reply.payload.value.text,
      },
      null,
      2,
    ),
  );
  await app.stop();
}
