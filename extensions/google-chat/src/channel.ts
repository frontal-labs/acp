import type { ChannelDefinition } from "@frontal-labs/open-channel";

import { createGoogleChatSink } from "./sink.js";
import { createGoogleChatSource } from "./source.js";
import type { GoogleChatChannelOptions } from "./types.js";

/** Creates the Google Chat source/sink pair consumed by `openChannel()`. */
export function createGoogleChatChannel(options: GoogleChatChannelOptions): ChannelDefinition {
  return {
    provider: "google-chat",
    sink: createGoogleChatSink(options.transport),
    source: createGoogleChatSource(options),
  };
}
