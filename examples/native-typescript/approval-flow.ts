// biome-ignore lint/correctness/noUndeclaredDependencies: This native example runs from the root workspace.
import { RuleBasedPolicyEngine } from "@acp/policy";
// biome-ignore lint/correctness/noUndeclaredDependencies: This native example runs from the root workspace.
import { ApprovalOutcome } from "@acp/protocol";
// biome-ignore lint/correctness/noUndeclaredDependencies: This native example runs from the root workspace.
import { AcpRuntime } from "@acp/runtime";
// biome-ignore lint/correctness/noUndeclaredDependencies: This native example runs from the root workspace.
import { createTestAction, createTestAgent, createTestHuman } from "@acp/testing";

const agent = createTestAgent("agent:operator", "Operator Agent");
const approver = createTestHuman("human:approver", "Approver");
const runtime = new AcpRuntime({
  policy: new RuleBasedPolicyEngine({
    rules: [
      {
        actionType: "calendar.create",
        allowed: true,
        id: "calendar-approval",
        reason: "Calendar changes require human approval",
        requiresApproval: true,
      },
    ],
  }),
});

const pending = await runtime.submitAction({
  action: createTestAction("calendar.create", "action:calendar", "calendar:team"),
  actor: agent,
  approver,
  deadline: new Date(Date.now() + 60_000),
  reason: "Schedule the approved team meeting",
});

console.log({ events: pending.events.map((event) => event.eventType), status: pending.status });

if (pending.approvalId) {
  const decision = await runtime.decideApproval({
    approvalId: pending.approvalId,
    approver,
    outcome: ApprovalOutcome.GRANTED,
    reason: "Approved by the example approver",
  });
  console.log({ decisionEvents: decision.emitted.map((event) => event.eventType) });
}
