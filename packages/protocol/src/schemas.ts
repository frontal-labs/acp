import type { JsonValue } from "@bufbuild/protobuf";
import { z } from "zod";

import { EVENT_TYPES, OCP_PROTOCOL_VERSIONS } from "./constants.js";

const actorRefJsonSchema = z
  .object({
    authority: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
    displayName: z.string().optional(),
    id: z.string().optional(),
    type: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const channelRefJsonSchema = z
  .object({
    address: z.string().optional(),
    channelId: z.string().optional(),
    provider: z.string().optional(),
    threadId: z.string().optional(),
  })
  .passthrough();

const conversationRefJsonSchema = z
  .object({
    id: z.string().optional(),
    participants: z.array(actorRefJsonSchema).optional(),
    status: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const payloadValueSchema = z
  .custom<Record<string, unknown>>(
    (value) => value !== null && typeof value === "object" && !Array.isArray(value),
    "OCP payload must be an object",
  )
  .pipe(z.record(z.string(), z.unknown()));

/** The supported event names in the OCP v0.1 protocol. */
export const EventNameSchema = z.enum(EVENT_TYPES);

/** The validated discriminated union used by `createEvent`. */
export const EventPayloadInputSchema = z.discriminatedUnion("case", [
  z.object({ case: z.literal("messageReceived"), value: payloadValueSchema }),
  z.object({ case: z.literal("messageSent"), value: payloadValueSchema }),
  z.object({ case: z.literal("taskCreated"), value: payloadValueSchema }),
  z.object({ case: z.literal("taskAssigned"), value: payloadValueSchema }),
  z.object({ case: z.literal("approvalRequested"), value: payloadValueSchema }),
  z.object({ case: z.literal("approvalDecided"), value: payloadValueSchema }),
  z.object({ case: z.literal("approvalExpired"), value: payloadValueSchema }),
  z.object({ case: z.literal("escalationTriggered"), value: payloadValueSchema }),
  z.object({ case: z.literal("handoffInitiated"), value: payloadValueSchema }),
  z.object({ case: z.literal("handoffCompleted"), value: payloadValueSchema }),
  z.object({ case: z.literal("policyEvaluated"), value: payloadValueSchema }),
  z.object({ case: z.literal("actionExecuted"), value: payloadValueSchema }),
  z.object({ case: z.literal("actionFailed"), value: payloadValueSchema }),
]);

/** Runtime schema for untrusted input passed to `createEvent`. */
export const EventInputSchema = z
  .object({
    actor: actorRefJsonSchema.optional(),
    causationId: z.string().optional(),
    channel: channelRefJsonSchema.optional(),
    conversation: conversationRefJsonSchema.optional(),
    correlationId: z.string().optional(),
    eventId: z.string().optional(),
    eventType: EventNameSchema,
    extensions: z.record(z.string(), z.string()).optional(),
    idempotencyKey: z.string().optional(),
    occurredAt: z.unknown().optional(),
    payload: EventPayloadInputSchema,
    protocolVersion: z.enum(OCP_PROTOCOL_VERSIONS).optional(),
    recipient: actorRefJsonSchema.optional(),
    source: actorRefJsonSchema.optional(),
  })
  .passthrough();

/** Runtime schema for an OCP ProtoJSON envelope before protobuf decoding. */
export const EventEnvelopeJsonSchema = z
  .object({
    actor: actorRefJsonSchema.optional(),
    causationId: z.string().optional(),
    channel: channelRefJsonSchema.optional(),
    conversation: conversationRefJsonSchema.optional(),
    correlationId: z.string().optional(),
    eventId: z.string().optional(),
    eventType: z.string().optional(),
    extensions: z.record(z.string(), z.string()).optional(),
    idempotencyKey: z.string().optional(),
    occurredAt: z.union([z.string(), z.object({}).passthrough()]).optional(),
    protocolVersion: z.string().optional(),
    recipient: actorRefJsonSchema.optional(),
    source: actorRefJsonSchema.optional(),
  })
  .passthrough();

/** Validates an unknown value as an OCP ProtoJSON-compatible value. */
export function parseEventJson(value: unknown): JsonValue {
  return EventEnvelopeJsonSchema.parse(value) as JsonValue;
}
