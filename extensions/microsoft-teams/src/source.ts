import type { ChannelSource } from "@acp/adapter";
import {
  createProviderSource,
  optionalRecord,
  optionalString,
  providerActor,
  providerEvent,
  sourceRecord,
} from "@acp/ext-shared";
import { ApprovalDecidedSchema, ApprovalOutcome, MessageReceivedSchema } from "@acp/protocol";
import { create } from "@bufbuild/protobuf";

import type { TeamsSourceOptions } from "./types.js";

/** Normalizes Teams message and approval-card payloads into v1 ACP events. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Provider payload variants are normalized in one boundary function.
export async function normalizeTeamsEvent(
  input: unknown,
  metadata: import("@acp/ext-shared").ProviderReceiveMetadata = {},
  options: TeamsSourceOptions = {},
) {
  const body = sourceRecord(input, "Microsoft Teams");
  const action = optionalRecord(body.value) ?? optionalRecord(body.action);
  const actionName = optionalString(action ?? {}, "action") ?? optionalString(action ?? {}, "verb");
  const approvalId =
    optionalString(action ?? {}, "approvalId") ?? optionalString(body, "approvalId");
  const externalActorId =
    optionalString(action ?? {}, "actorId") ?? optionalString(body, "actorId");
  if (approvalId && (actionName === "approve" || actionName === "deny")) {
    const actor = options.actorResolver
      ? await options.actorResolver(externalActorId ?? "unknown")
      : providerActor(`teams:${externalActorId ?? "unknown"}`, externalActorId ?? "Teams User");
    return providerEvent(
      {
        actor,
        channelId: optionalString(body, "conversationId") ?? "teams:approval",
        conversationId: `teams:${optionalString(body, "conversationId") ?? approvalId}`,
        eventType: actionName === "approve" ? "approval.granted" : "approval.denied",
        extensions: { "acp.provider": "microsoft-teams", "teams.approval_id": approvalId },
        payload: {
          case: "approvalDecided",
          value: create(ApprovalDecidedSchema, {
            approvalId,
            approver: actor,
            outcome: actionName === "approve" ? ApprovalOutcome.GRANTED : ApprovalOutcome.DENIED,
            reason: optionalString(action ?? {}, "reason") ?? "Teams approval action",
          }),
        },
        recipient: options.recipient,
      },
      { ...metadata, eventId: metadata.eventId ?? optionalString(body, "id") ?? approvalId },
    );
  }

  const message = optionalRecord(body.resource) ?? optionalRecord(body.message) ?? body;
  if (optionalString(message, "type") && optionalString(message, "type") !== "message") {
    return [];
  }
  const from = optionalRecord(message.from);
  const user = optionalRecord(from?.user) ?? from;
  const actorId = optionalString(user ?? {}, "id") ?? optionalString(message, "fromId");
  const conversation = optionalRecord(message.conversation);
  const conversationId =
    optionalString(conversation ?? {}, "id") ?? optionalString(message, "conversationId");
  if (!(actorId && conversationId)) {
    return [];
  }
  if (options.botId && actorId === options.botId) {
    return [];
  }
  const actor = options.actorResolver
    ? await options.actorResolver(actorId)
    : providerActor(`teams:${actorId}`, optionalString(user ?? {}, "displayName") ?? actorId);
  const eventId = metadata.eventId ?? optionalString(body, "id") ?? optionalString(message, "id");
  return providerEvent(
    {
      actor,
      channelId: conversationId,
      conversationId: `teams:${conversationId}`,
      conversationParticipants: [actor],
      eventType: "message.received",
      extensions: { "acp.provider": "microsoft-teams" },
      payload: {
        case: "messageReceived",
        value: create(MessageReceivedSchema, {
          text: optionalString(message, "text") ?? optionalString(message, "body") ?? "",
        }),
      },
      recipient: options.recipient,
      threadId: optionalString(message, "replyToId"),
    },
    { ...metadata, eventId, idempotencyKey: metadata.idempotencyKey ?? eventId },
  );
}

/** Creates a Teams source for `createAcp({ channels })`. */
export function createTeamsSource(options: TeamsSourceOptions = {}): ChannelSource {
  return createProviderSource("microsoft-teams", (input, metadata) =>
    normalizeTeamsEvent(input, metadata, options),
  );
}
