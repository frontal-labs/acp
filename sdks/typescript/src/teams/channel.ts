import type { ChannelDefinition } from "../types.js";

import { teamsSink } from "./sink.js";
import { teamsSource } from "./source.js";
import type { TeamsChannelOptions } from "./types.js";

/** Creates the Teams source/sink pair consumed by `openChannel()`. */
export function teamsChannel(options: TeamsChannelOptions): ChannelDefinition {
  return {
    provider: "microsoft-teams",
    sink: teamsSink(options.transport),
    source: teamsSource(options),
  };
}
