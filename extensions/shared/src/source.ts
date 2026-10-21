import type { ChannelSource } from "@frontal-labs/open-channel-adapter";
import { OcpError, ValidationError } from "@frontal-labs/open-channel-core";
import type { EventEnvelope } from "@frontal-labs/open-channel-protocol";

import type { ProviderReceiveMetadata, ProviderRecord } from "./types.js";

/** Creates a source with consistent provider-boundary error classification. */
export function createProviderSource<TInput = unknown>(
  provider: string,
  normalizeInput: (
    input: TInput,
    metadata?: ProviderReceiveMetadata,
  ) => EventEnvelope | EventEnvelope[] | Promise<EventEnvelope | EventEnvelope[]>,
  lifecycle: Pick<ChannelSource, "start" | "stop"> = {},
): ChannelSource {
  return {
    normalize: async (input, metadata) => {
      try {
        return await normalizeInput(input as TInput, metadata);
      } catch (error) {
        if (error instanceof OcpError) {
          throw error;
        }
        throw new ValidationError(`Unable to normalize ${provider} input`, {
          cause: error,
          provider,
          stage: "normalize",
        });
      }
    },
    provider,
    start: lifecycle.start,
    stop: lifecycle.stop,
  };
}

/** Converts unknown input into a provider JSON record for source factories. */
export function sourceRecord(input: unknown, provider: string): ProviderRecord {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError(`Invalid ${provider} input`, { provider, stage: "normalize" });
  }
  return input as ProviderRecord;
}
