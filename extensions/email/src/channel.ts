import type { ChannelDefinition } from "openchannel";

import { createEmailSink } from "./sink.js";
import { createEmailSource } from "./source.js";
import type { EmailChannelOptions } from "./types.js";

/** Creates the email source/sink pair consumed by `openChannel()`. */
export function createEmailChannel(options: EmailChannelOptions): ChannelDefinition {
  return {
    provider: "email",
    sink: createEmailSink(options.transport),
    source: createEmailSource(options),
  };
}
