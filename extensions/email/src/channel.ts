import type { ChannelDefinition } from "acp-sdk";

import { createEmailSink } from "./sink.js";
import { createEmailSource } from "./source.js";
import type { EmailChannelOptions } from "./types.js";

/** Creates the email source/sink pair consumed by `createAcp()`. */
export function createEmailChannel(options: EmailChannelOptions): ChannelDefinition {
  return {
    provider: "email",
    sink: createEmailSink(options.transport),
    source: createEmailSource(options),
  };
}
