import { action, eventType, openChannel } from "@frontal-labs/open-channel";
import { RuleBasedPolicyEngine } from "@frontal-labs/open-channel-policy";
import {
  createTestAgent,
  createTestChannelAdapter,
  createTestEvent,
  createTestEventStore,
  createTestHuman,
} from "@frontal-labs/open-channel-testing";

/** Narrows unknown action input to the ticket shape this demo expects. */
function isTicketInput(input: unknown): input is { ticketId: string } {
  return (
    typeof input === "object" &&
    input !== null &&
    "ticketId" in input &&
    typeof input.ticketId === "string"
  );
}

/** Runs the reference approval flow through the high-level app API. */
export async function runDemo(): Promise<void> {
  const adapter = createTestChannelAdapter();
  const human = createTestHuman("human:gabriel", "Gabriel");
  const agent = createTestAgent("agent:support", "Support Agent");
  const manager = createTestHuman("human:manager", "Support Manager");
  const sendReply = action<{ ticketId: string }, { sent: boolean }>({
    execute: (input) => {
      console.log(`sending customer reply for ${input.ticketId}`);
      return { sent: true };
    },
    type: "send_customer_reply",
    validate: (input: unknown) => {
      if (!isTicketInput(input)) {
        throw new Error("ticketId is required");
      }
      return input;
    },
  });
  let approvalId = "";
  const app = openChannel({
    actions: [sendReply],
    agents: [
      {
        id: agent.id,
        name: agent.displayName,
        onMessage: async (context) => {
          const result = await context.request(
            "send_customer_reply",
            { ticketId: "ticket:99" },
            { approver: manager, reason: "Customer-facing replies require review" },
          );
          if (result.status === "approval_required") {
            ({ approvalId } = result);
          }
        },
      },
    ],
    channels: [
      {
        provider: "test",
        sink: adapter,
        source: {
          normalize: async () => createTestEvent({ actor: human, recipient: agent }),
          provider: "test",
        },
      },
    ],
    policy: new RuleBasedPolicyEngine({
      rules: [
        {
          actionType: "send_customer_reply",
          allowed: true,
          id: "support-reply-review",
          requiresApproval: true,
        },
      ],
    }),
    store: createTestEventStore(),
  });
  app.on("action.executed", (event) => {
    console.log(`action executed: ${event.eventId}`);
  });

  await app.start();
  await app.receive("test", { text: "Can you answer ticket 99?" });
  console.log(`action status: ${approvalId ? "approval_required" : "unexpected"}`);
  await app.approve(approvalId, manager, "Approved by the support manager");
  await app.stop();

  console.log("\nOCP delivery:");
  for (const event of adapter.sent) {
    console.log(`${eventType(event)} (${event.eventId})`);
  }
}
