import type { ChannelDefinition } from "@frontal-labs/open-channel";

import { createA2ASink } from "./sink.js";
import { createA2ASource } from "./source.js";
import type { A2AChannelOptions } from "./types.js";

/** Creates the A2A source/sink pair consumed by `createOcp()`. */
export function createA2AChannel(options: A2AChannelOptions): ChannelDefinition {
  return {
    provider: "a2a",
    sink: createA2ASink(options.transport),
    source: createA2ASource(options),
  };
}
