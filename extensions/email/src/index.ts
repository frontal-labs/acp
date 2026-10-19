export { createEmailChannel } from "./channel.js";
export { createEmailSink } from "./sink.js";
export { createEmailSource, normalizeEmailMessage } from "./source.js";
export type {
  EmailChannel,
  EmailChannelOptions,
  EmailMessage,
  EmailPoller,
  EmailSendInput,
  EmailSourceOptions,
  EmailTransport,
} from "./types.js";
