import type { ChannelDefinition } from "../types.js";

import { emailSink } from "./sink.js";
import { emailSource } from "./source.js";
import type { EmailChannelOptions } from "./types.js";

/**
 * Creates the email source and sink pair for `openChannel({ channels })`.
 * The source handles inbound mail (`poller` and `receive()`), the sink sends `message.sent`.
 */
export function emailChannel(options: EmailChannelOptions): ChannelDefinition {
  return {
    provider: "email",
    sink: emailSink(options.transport),
    source: emailSource(options),
  };
}
