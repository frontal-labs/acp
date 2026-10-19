import { InMemoryChannelAdapter } from "@acp/adapter";
import { RuleBasedPolicyEngine } from "@acp/policy";
import { createTestAgent, createTestEvent, createTestHuman } from "@acp/testing";
import { createAcp, defineAction } from "acp-sdk";

/** Runs the reference approval flow through the high-level app API. */
export async function runDemo(): Promise<void> {
  const adapter = new InMemoryChannelAdapter();
  const human = createTestHuman("human:gabriel", "Gabriel");
  const agent = createTestAgent("agent:support", "Support Agent");
  const manager = createTestHuman("human:manager", "Support Manager");
  const action = defineAction<{ ticketId: string }, { sent: boolean }>({
    execute: (input) => {
      console.log(`sending customer reply for ${input.ticketId}`);
      return { sent: true };
    },
    type: "send_customer_reply",
    validate: (input) => {
      if (!input || typeof input !== "object" || !("ticketId" in input)) {
        throw new Error("ticketId is required");
      }
      return input as { ticketId: string };
    },
  });
  let approvalId = "";
  const app = createAcp({
    actions: [action],
    agents: [
      {
        id: agent.id,
        name: agent.displayName,
        onMessage: async (context) => {
          const result = await context.actions.request(
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
        provider: "memory",
        sink: adapter,
        source: {
          normalize: async () => createTestEvent({ actor: human, recipient: agent }),
          provider: "memory",
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
  });
  app.on("action.executed", (event) => {
    console.log(`action executed: ${event.eventId}`);
  });

  await app.start();
  await app.receive("memory", { text: "Can you answer ticket 99?" });
  console.log(`action status: ${approvalId ? "approval_required" : "unexpected"}`);
  await app.approve(approvalId, manager, "Approved by the support manager");
  await app.stop();

  console.log("\nACP delivery:");
  for (const event of adapter.sent) {
    console.log(`${event.eventType} (${event.eventId})`);
  }
}
