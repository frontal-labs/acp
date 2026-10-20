import { RuleBasedPolicyEngine } from "@acp/policy";
import { ActorRefSchema, ActorType, ChannelRefSchema, messageReceived } from "@acp/protocol";
import { create } from "@bufbuild/protobuf";
import { createAcp } from "acp-sdk";

import { createExampleChannel, createExampleEventStore } from "./example-kit.js";

/** Plain text handler: receives an inbound message and returns the reply text. */
export type TextAgent = (text: string) => string | Promise<string>;

/** Runs a text harness behind the public ACP application API. */
export async function runAcpTextAgent(name: string, handler: TextAgent): Promise<void> {
  const agentId = `agent:${name.toLowerCase().replace(/\s+/g, "-")}`;
  const human = create(ActorRefSchema, { id: "human:example", type: ActorType.HUMAN });
  const agent = create(ActorRefSchema, { id: agentId, type: ActorType.AGENT });
  const { channel, sent } = createExampleChannel("example");
  const app = createAcp({
    agents: [
      {
        description: `ACP bridge for ${name}`,
        id: agentId,
        name,
        onMessage: async (context) => {
          await context.reply(await handler(context.message.text));
        },
        skills: [{ id: "respond", name: "Respond to an ACP message" }],
      },
    ],
    channels: [channel],
    eventStore: createExampleEventStore(),
    policy: new RuleBasedPolicyEngine({ rules: [] }),
  });

  await app.start();
  await app.ingest(
    messageReceived({
      actor: human,
      channel: create(ChannelRefSchema, { channelId: "channel:example", provider: "example" }),
      recipient: agent,
      text: "Explain why ACP keeps policy outside the model prompt.",
    }),
  );
  await app.stop();

  const [reply] = sent;
  if (reply?.payload.case !== "messageSent") {
    throw new Error("The ACP bridge did not dispatch a message.sent reply");
  }

  console.log(
    JSON.stringify(
      {
        agentCard: app.listAgentCards().find((card) => card.id === agentId),
        correlationId: reply.correlationId,
        eventType: reply.eventType,
        reply: reply.payload.value.text,
      },
      null,
      2,
    ),
  );
}
