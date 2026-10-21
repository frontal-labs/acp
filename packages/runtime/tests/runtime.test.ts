import { RuleBasedPolicyEngine } from "@frontal-labs/open-channel-policy";
import { ActorType, ApprovalOutcome } from "@frontal-labs/open-channel-protocol";
import {
  createTestAction,
  createTestAgent,
  createTestEvent,
  createTestEventStore,
  createTestHuman,
  eventTypes,
} from "@frontal-labs/open-channel-testing";
import { describe, expect, it } from "vitest";
import { ManualClock, OcpRuntime } from "../src/index.js";

describe("@frontal-labs/open-channel-runtime", () => {
  it("expires approval requests and emits escalation", async () => {
    const clock = new ManualClock(new Date("2026-10-19T14:00:00.000Z"));
    const runtime = new OcpRuntime({
      clock,
      defaultApprovalTimeoutMs: 1000,
      eventStore: createTestEventStore(),
      policy: new RuleBasedPolicyEngine({
        rules: [{ actionType: "send_reply", allowed: true, id: "review", requiresApproval: true }],
      }),
    });
    const agent = createTestAgent();
    const approver = createTestHuman("human:approver", "Approver", "manager");

    const result = await runtime.submitAction({
      action: createTestAction("send_reply"),
      actor: agent,
      approver,
      reason: "Needs review",
    });
    await clock.advanceBy(1000);

    expect(result.status).toBe("approval_required");
    expect(eventTypes(await runtime.eventStore.all())).toEqual([
      "policy.allowed",
      "approval.requested",
      "approval.expired",
      "escalation.triggered",
    ]);
  });

  it("deduplicates events and resolves an approval", async () => {
    const runtime = new OcpRuntime({
      eventStore: createTestEventStore(),
      policy: new RuleBasedPolicyEngine({
        rules: [{ actionType: "send_reply", allowed: true, id: "review", requiresApproval: true }],
      }),
    });
    const agent = createTestAgent("agent:runtime");
    const approver = createTestHuman("human:runtime");
    const result = await runtime.submitAction({
      action: createTestAction("send_reply", "action:runtime"),
      actor: agent,
      approver,
      reason: "Needs review",
    });

    await runtime.decideApproval({
      approvalId: result.approvalId ?? "",
      approver,
      outcome: ApprovalOutcome.GRANTED,
    });
    const event = createTestEvent({ actor: createTestHuman(), eventId: "runtime-inbound" });
    expect((await runtime.process(event)).duplicate).toBe(false);
    expect((await runtime.process(event)).duplicate).toBe(true);
    expect((await runtime.eventStore.all()).length).toBe(4);
    expect(agent.type).toBe(ActorType.AGENT);
  });
});
