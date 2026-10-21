import { create } from "@bufbuild/protobuf";
import type { ChannelSource } from "@frontal-labs/open-channel-adapter";
import {
  createProviderSource,
  optionalRecord,
  optionalString,
  providerActor,
  providerEvent,
  sourceRecord,
} from "@frontal-labs/open-channel-ext-shared";
import { ActorType, MessageReceivedSchema } from "@frontal-labs/open-channel-protocol";

import type { A2ASourceOptions } from "./types.js";

/** Normalizes a minimal A2A message/task payload into an OCP message event. */
export function normalizeA2AEvent(
  input: unknown,
  metadata: import("@frontal-labs/open-channel-ext-shared").ProviderReceiveMetadata = {},
  options: A2ASourceOptions = {},
) {
  const body = sourceRecord(input, "A2A");
  const message = optionalRecord(body.message) ?? body;
  const sender = optionalRecord(message.sender) ?? optionalRecord(body.agent);
  const senderId =
    optionalString(sender ?? {}, "id") ?? optionalString(sender ?? {}, "name") ?? "remote-agent";
  if (options.localAgentId && senderId === options.localAgentId) {
    return [];
  }
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const text =
    parts
      .map((part) => optionalString(optionalRecord(part) ?? {}, "text"))
      .filter((value): value is string => Boolean(value))
      .join("\n") ||
    optionalString(message, "text") ||
    "";
  const contextId =
    optionalString(body, "contextId") ?? optionalString(body, "context_id") ?? "remote-context";
  const taskId = optionalString(body, "taskId") ?? optionalString(body, "task_id");
  const eventId = metadata.eventId ?? optionalString(body, "id") ?? taskId;
  const actor = providerActor(`a2a:${senderId}`, senderId, ActorType.AGENT);
  return providerEvent(
    {
      actor,
      channelId: contextId,
      conversationId: `a2a:${contextId}`,
      conversationParticipants: [actor],
      eventType: "message.received",
      extensions: {
        "ocp.provider": "a2a",
        ...(taskId ? { "a2a.task_id": taskId } : {}),
      },
      payload: { case: "messageReceived", value: create(MessageReceivedSchema, { text }) },
      recipient: options.recipient,
      threadId: taskId,
    },
    { ...metadata, eventId, idempotencyKey: metadata.idempotencyKey ?? eventId },
  );
}

/** Creates an A2A source for `createOcp({ channels })`. */
export function createA2ASource(options: A2ASourceOptions = {}): ChannelSource {
  return createProviderSource("a2a", (input, metadata) =>
    normalizeA2AEvent(input, metadata, options),
  );
}
