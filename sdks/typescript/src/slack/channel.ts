import type { ChannelDefinition } from "../types.js";

import { slackSink } from "./sink.js";
import { slackSource } from "./source.js";
import type { SlackChannelOptions } from "./types.js";

/** Creates the Slack source/sink pair consumed by `openChannel()`. */
export function slackChannel(options: SlackChannelOptions): ChannelDefinition {
  return {
    provider: "slack",
    sink: slackSink(options.transport),
    source: slackSource(options),
  };
}
