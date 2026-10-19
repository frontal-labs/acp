import { randomUUID } from "node:crypto";

/** Creates a UUID-backed identifier with a stable namespace prefix. */
export function createIdentifier(prefix: string): string {
  return `${prefix}:${randomUUID()}`;
}

/** Creates an identifier for correlating related protocol events. */
export function createCorrelationId(): string {
  return createIdentifier("corr");
}

/** Creates an identifier for an action submitted by an agent. */
export function createActionId(): string {
  return createIdentifier("action");
}
