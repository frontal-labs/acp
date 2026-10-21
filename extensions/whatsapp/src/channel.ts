import type { ChannelDefinition } from "@frontal-labs/open-channel";

import { createWhatsAppSink } from "./sink.js";
import { createWhatsAppSource } from "./source.js";
import type { WhatsAppChannelOptions } from "./types.js";

/** Creates the WhatsApp source/sink pair consumed by `openChannel()`. */
export function createWhatsAppChannel(options: WhatsAppChannelOptions): ChannelDefinition {
  return {
    provider: "whatsapp",
    sink: createWhatsAppSink(options.transport, options.phoneNumberId),
    source: createWhatsAppSource(options),
  };
}
