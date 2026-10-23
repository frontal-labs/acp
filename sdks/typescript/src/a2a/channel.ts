import type { ChannelDefinition } from "../types.js";

import { a2aSink } from "./sink.js";
import { a2aSource } from "./source.js";
import type { A2AChannelOptions } from "./types.js";

/**
 * Creates the A2A source and sink pair for `openChannel({ channels })`.
 * The source accepts inbound peer messages through `receive()`; the sink sends `message.sent`.
 */
export function a2aChannel(options: A2AChannelOptions): ChannelDefinition {
  return {
    provider: "a2a",
    sink: a2aSink(options.transport),
    source: a2aSource(options),
  };
}
