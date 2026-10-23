import type { ChannelDefinition } from "../types.js";

import { googleChatSink } from "./sink.js";
import { googleChatSource } from "./source.js";
import type { GoogleChatChannelOptions } from "./types.js";

/** Creates the Google Chat source/sink pair consumed by `openChannel()`. */
export function googleChatChannel(options: GoogleChatChannelOptions): ChannelDefinition {
  return {
    provider: "google-chat",
    sink: googleChatSink(options.transport),
    source: googleChatSource(options),
  };
}
