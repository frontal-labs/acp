import type { ChannelDefinition } from "../types.js";

import { whatsappSink } from "./sink.js";
import { whatsappSource } from "./source.js";
import type { WhatsAppChannelOptions } from "./types.js";

/** Creates the WhatsApp source/sink pair consumed by `openChannel()`. */
export function whatsappChannel(options: WhatsAppChannelOptions): ChannelDefinition {
  return {
    provider: "whatsapp",
    sink: whatsappSink(options.transport, options.phoneNumberId),
    source: whatsappSource(options),
  };
}
