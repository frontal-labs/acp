import type { ChannelDefinition } from "openchannel";

import { createSlackSink } from "./sink.js";
import { createSlackSource } from "./source.js";
import type { SlackChannelOptions } from "./types.js";

/** Creates the Slack source/sink pair consumed by `openChannel()`. */
export function createSlackChannel(options: SlackChannelOptions): ChannelDefinition {
  return {
    provider: "slack",
    sink: createSlackSink(options.transport),
    source: createSlackSource(options),
  };
}
