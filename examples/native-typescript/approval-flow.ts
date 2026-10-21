import { create } from "@bufbuild/protobuf";
import { RuleBasedPolicyEngine } from "@frontal-labs/open-channel-policy";
import {
  ActionRequestSchema,
  ActorRefSchema,
  ActorType,
  ApprovalOutcome,
} from "@frontal-labs/open-channel-protocol";
import { OcpRuntime } from "@frontal-labs/open-channel-runtime";

import { createExampleEventStore } from "../_shared/typescript/example-kit.js";

const agent = create(ActorRefSchema, { id: "agent:operator", type: ActorType.AGENT });
const approver = create(ActorRefSchema, { id: "human:approver", type: ActorType.HUMAN });
const runtime = new OcpRuntime({
  eventStore: createExampleEventStore(),
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

const action = create(ActionRequestSchema, {
  actionId: "action:calendar",
  parameters: { title: "Team sync" },
  target: "calendar:team",
  type: "calendar.create",
});

const pending = await runtime.submitAction({
  action,
  actor: agent,
  approver,
  deadline: new Date(Date.now() + 60_000),
  reason: "Schedule the approved team meeting",
});

console.log({ events: pending.events.map((event) => event.eventType), status: pending.status });

if (pending.approvalId) {
  await runtime.decideApproval({
    approvalId: pending.approvalId,
    approver,
    outcome: ApprovalOutcome.GRANTED,
    reason: "Approved by the example approver",
  });
  const recorded = await runtime.queryEvents({});
  console.log({ recorded: recorded.map((event) => event.eventType) });
}
