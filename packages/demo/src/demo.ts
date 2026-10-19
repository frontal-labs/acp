import { RuleBasedPolicyEngine } from "@acp/policy";
import {
  ActionRequestSchema,
  ActorType,
  createEvent,
  eventToJson,
  MessageReceivedSchema,
} from "@acp/protocol";
import { AcpRuntime, createActor, ManualClock } from "@acp/runtime";
import { create } from "@bufbuild/protobuf";

/** Runs the reference approval and escalation flow. */
export async function runDemo(): Promise<void> {
  const clock = new ManualClock(new Date("2026-10-19T14:00:00.000Z"));
  const human = createActor("human:gabriel", ActorType.HUMAN, "Gabriel");
  const agent = createActor("agent:support", ActorType.AGENT, "Support Agent", ["support.reply"]);
  const manager = createActor("human:manager", ActorType.HUMAN, "Support Manager");

  const policy = new RuleBasedPolicyEngine({
    rules: [
      {
        actionType: "send_customer_reply",
        allowed: true,
        id: "support-reply-review",
        reason: "Customer-facing replies require human approval",
        requiresApproval: true,
      },
      {
        actionType: "message_internal_channel",
        allowed: true,
        id: "internal-channel-message",
      },
      {
        actionType: "message_executive",
        allowed: false,
        id: "executive-contact-blocked",
        reason: "Agent is not allowed to contact executives directly",
      },
    ],
  });

  const runtime = new AcpRuntime({
    clock,
    defaultApprovalTimeoutMs: 5000,
    policy,
  });

  runtime.subscribe((event) => {
    console.log(`${event.eventType} (${event.eventId})`);
  });

  const inbound = createEvent({
    actor: human,
    eventType: "message.received",
    payload: {
      case: "messageReceived",
      value: create(MessageReceivedSchema, {
        text: "Can you answer the customer issue on ticket 99?",
      }),
    },
    recipient: agent,
    source: human,
  });

  await runtime.process(inbound);

  const result = await runtime.submitAction({
    action: create(ActionRequestSchema, {
      actionId: "ticket-99-reply",
      parameters: { ticket_id: "ticket-99" },
      target: "ticket:99",
      type: "send_customer_reply",
    }),
    actor: agent,
    approver: manager,
    deadline: new Date(clock.now().getTime() + 5000),
    reason: "Confidence below the autonomous-send threshold",
  });

  console.log(`action status: ${result.status}`);
  console.log(`approval id: ${result.approvalId}`);

  await clock.advanceBy(5000);

  const audit = await runtime.eventStore.all();
  console.log("\nACP audit trail:");
  for (const event of audit) {
    console.log(JSON.stringify(eventToJson(event)));
  }
}
