import type { ChannelDefinition } from "acp-sdk";

import { createWhatsAppSink } from "./sink.js";
import { createWhatsAppSource } from "./source.js";
import type { WhatsAppChannelOptions } from "./types.js";

/** Creates the WhatsApp source/sink pair consumed by `createAcp()`. */
export function createWhatsAppChannel(options: WhatsAppChannelOptions): ChannelDefinition {
  return {
    provider: "whatsapp",
    sink: createWhatsAppSink(options.transport, options.phoneNumberId),
    source: createWhatsAppSource(options),
  };
}
