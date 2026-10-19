import type { ChannelDefinition } from "acp-sdk";

import { createTeamsSink } from "./sink.js";
import { createTeamsSource } from "./source.js";
import type { TeamsChannelOptions } from "./types.js";

/** Creates the Teams source/sink pair consumed by `createAcp()`. */
export function createTeamsChannel(options: TeamsChannelOptions): ChannelDefinition {
  return {
    provider: "microsoft-teams",
    sink: createTeamsSink(options.transport),
    source: createTeamsSource(options),
  };
}
