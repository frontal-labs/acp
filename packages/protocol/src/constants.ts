/** Protocol versions understood by the unified ACP event API. */
export const ACP_PROTOCOL_VERSIONS = ["0.1", "0.2"] as const;

/** A wire protocol version: `0.1` (legacy `eventType` envelope) or `0.2` (payload-discriminated envelope). */
export type ProtocolVersion = (typeof ACP_PROTOCOL_VERSIONS)[number];

/** Default ACP wire protocol version used when no version is requested. */
export const ACP_PROTOCOL_VERSION = "0.1" as const satisfies ProtocolVersion;

/** ACP v0.2 protocol version used by the payload-discriminated envelope. */
export const ACP_V2_PROTOCOL_VERSION = "0.2" as const satisfies ProtocolVersion;

/** Event names shared by ACP v0.1 and v0.2. */
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
