/** Current ACP wire protocol version. */
export const ACP_PROTOCOL_VERSION = "0.1";

/** Event names supported by ACP v0.1. */
export const EVENT_TYPES = [
  "message.received",
  "message.sent",
  "task.created",
  "task.assigned",
  "approval.requested",
  "approval.granted",
  "approval.denied",
  "approval.expired",
  "escalation.triggered",
  "handoff.initiated",
  "handoff.completed",
  "policy.allowed",
  "policy.blocked",
  "action.executed",
  "action.failed",
] as const;
