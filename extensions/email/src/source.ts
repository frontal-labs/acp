import type { ChannelSource } from "@acp/adapter";
import { createProviderSource, providerActor, providerEvent, sourceRecord } from "@acp/ext-shared";
import { MessageReceivedSchema } from "@acp/protocol";
import { create } from "@bufbuild/protobuf";

import type { EmailMessage, EmailSourceOptions } from "./types.js";

/** Normalizes an email message into an ACP message.received event. */
export async function normalizeEmailMessage(
  input: unknown,
  options: EmailSourceOptions,
  metadata: import("@acp/ext-shared").ProviderReceiveMetadata = {},
) {
  const message = sourceRecord(input, "email") as unknown as EmailMessage;
  if (!(message.from && message.text && options.mailbox)) {
    return [];
  }
  const actor = options.actorResolver
    ? await options.actorResolver(message.from)
    : providerActor(`email:${message.from}`, message.from);
  const eventId = metadata.eventId ?? message.id;
  const threadId = message.threadId ?? message.inReplyTo ?? message.references?.at(-1);
  return providerEvent(
    {
      actor,
      address: message.from,
      channelId: options.mailbox,
      conversationId: `email:${threadId ?? message.id ?? message.subject ?? message.from}`,
      conversationParticipants: [actor],
      eventType: "message.received",
      extensions: {
        "acp.provider": "email",
        ...(message.subject ? { "email.subject": message.subject } : {}),
        ...(message.id ? { "email.message_id": message.id } : {}),
      },
      payload: {
        case: "messageReceived",
        value: create(MessageReceivedSchema, {
          metadata: {
            from: message.from,
            subject: message.subject ?? "",
            to: message.to.join(","),
          },
          text: message.text,
        }),
      },
      threadId,
    },
    { ...metadata, eventId, idempotencyKey: metadata.idempotencyKey ?? eventId },
  );
}

/** Creates an email source with optional IMAP/webhook polling lifecycle. */
export function createEmailSource(options: EmailSourceOptions): ChannelSource {
  return createProviderSource(
    "email",
    (input, metadata) => normalizeEmailMessage(input, options, metadata),
    options.poller
      ? {
          start: async (emit, signal) => {
            for await (const message of options.poller?.poll(signal) ?? []) {
              if (signal.aborted) {
                return;
              }
              const normalized = await normalizeEmailMessage(message, options, {
                receivedAt: new Date(),
              });
              await Promise.all(
                (Array.isArray(normalized) ? normalized : [normalized]).map((event) => emit(event)),
              );
            }
          },
          stop: options.poller.stop,
        }
      : {},
  );
}
