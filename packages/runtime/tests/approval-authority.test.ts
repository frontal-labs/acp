import { AuthorizationError } from "@acp/core";
import { RuleBasedPolicyEngine } from "@acp/policy";
import { ActionRequestSchema, ActorRefSchema, ActorType, ApprovalOutcome } from "@acp/protocol";
import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { createTestEventStore } from "../../testing/src/index.js";
import { AcpRuntime } from "../src/index.js";

const agent = create(ActorRefSchema, { id: "agent:authority", type: ActorType.AGENT });
const approver = create(ActorRefSchema, { id: "human:approver", type: ActorType.HUMAN });
const intruder = create(ActorRefSchema, { id: "human:intruder", type: ActorType.HUMAN });

function createRuntime() {
  return new AcpRuntime({
    eventStore: createTestEventStore(),
    policy: new RuleBasedPolicyEngine({
      rules: [{ actionType: "refund.create", allowed: true, id: "refund", requiresApproval: true }],
    }),
  });
}

async function requestApproval(runtime: AcpRuntime) {
  const action = create(ActionRequestSchema, {
    actionId: "action:refund",
    target: "order:1",
    type: "refund.create",
  });
  const pending = await runtime.submitAction({
    action,
    actor: agent,
    approver,
    deadline: new Date(Date.now() + 60_000),
    reason: "refund over limit",
  });
  if (!pending.approvalId) {
    throw new Error("expected an approval request");
  }
  return pending.approvalId;
}

describe("approval authority", () => {
  it("rejects a decision from an actor other than the named approver", async () => {
    const runtime = createRuntime();
    const approvalId = await requestApproval(runtime);

    await expect(
      runtime.decideApproval({
        approvalId,
        approver: intruder,
        outcome: ApprovalOutcome.GRANTED,
        reason: "self-approved",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const recorded = await runtime.queryEvents({ eventType: "approval.granted" });
    expect(recorded).toHaveLength(0);
  });

  it("accepts a decision from the named approver and records it", async () => {
    const runtime = createRuntime();
    const approvalId = await requestApproval(runtime);

    await runtime.decideApproval({
      approvalId,
      approver,
      outcome: ApprovalOutcome.GRANTED,
      reason: "approved",
    });

    const recorded = await runtime.queryEvents({ eventType: "approval.granted" });
    expect(recorded).toHaveLength(1);
  });
});
