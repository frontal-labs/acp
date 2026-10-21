/** Protocol versions understood by the unified OCP event API. */
export const OCP_PROTOCOL_VERSIONS = ["0.1", "0.2"] as const;

/** A wire protocol version: `0.1` (legacy `eventType` envelope) or `0.2` (payload-discriminated envelope). */
export type ProtocolVersion = (typeof OCP_PROTOCOL_VERSIONS)[number];

/** Default OCP wire protocol version used when no version is requested. */
export const OCP_PROTOCOL_VERSION = "0.1" as const satisfies ProtocolVersion;

/** OCP v0.2 protocol version used by the payload-discriminated envelope. */
export const OCP_V2_PROTOCOL_VERSION = "0.2" as const satisfies ProtocolVersion;

/** Event names shared by OCP v0.1 and v0.2. */
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
