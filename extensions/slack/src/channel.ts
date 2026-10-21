import type { ChannelDefinition } from "@frontal-labs/open-channel";

import { createSlackSink } from "./sink.js";
import { createSlackSource } from "./source.js";
import type { SlackChannelOptions } from "./types.js";

/** Creates the Slack source/sink pair consumed by `createOcp()`. */
export function createSlackChannel(options: SlackChannelOptions): ChannelDefinition {
  return {
    provider: "slack",
    sink: createSlackSink(options.transport),
    source: createSlackSource(options),
  };
}
