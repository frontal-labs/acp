import { create } from "@bufbuild/protobuf";
import { RuleBasedPolicyEngine } from "@frontal-labs/open-channel-policy";
import {
  ActorRefSchema,
  ActorType,
  ChannelRefSchema,
  eventType,
  messageReceived,
} from "@frontal-labs/open-channel-protocol";
import { openChannel } from "openchannel";

import { createExampleChannel, createExampleEventStore } from "./example-kit.js";

/** Plain text handler: receives an inbound message and returns the reply text. */
export type TextAgent = (text: string) => string | Promise<string>;

/** Runs a text harness behind the public OCP application API. */
export async function runOpenChannelTextAgent(name: string, handler: TextAgent): Promise<void> {
  const agentId = `agent:${name.toLowerCase().replace(/\s+/g, "-")}`;
  const human = create(ActorRefSchema, { id: "human:example", type: ActorType.HUMAN });
  const agent = create(ActorRefSchema, { id: agentId, type: ActorType.AGENT });
  const { channel, sent } = createExampleChannel("example");
  const app = openChannel({
    agents: [
      {
        description: `OCP bridge for ${name}`,
        id: agentId,
        name,
        onMessage: async (context) => {
          await context.reply(await handler(context.message.text));
        },
        skills: [{ id: "respond", name: "Respond to an OCP message" }],
      },
    ],
    channels: [channel],
    policy: new RuleBasedPolicyEngine({ rules: [] }),
    store: createExampleEventStore(),
  });

  await app.start();
  await app.ingest(
    messageReceived({
      actor: human,
      channel: create(ChannelRefSchema, { channelId: "channel:example", provider: "example" }),
      recipient: agent,
      text: "Explain why OCP keeps policy outside the model prompt.",
    }),
  );
  await app.stop();

  const [reply] = sent;
  if (reply?.payload.case !== "messageSent") {
    throw new Error("The OCP bridge did not dispatch a message.sent reply");
  }

  console.log(
    JSON.stringify(
      {
        agentCard: app.agentCards().find((card) => card.id === agentId),
        correlationId: reply.correlationId,
        eventType: eventType(reply),
        reply: reply.payload.value.text,
      },
      null,
      2,
    ),
  );
}
