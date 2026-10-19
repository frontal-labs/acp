import { ValidationError } from "@acp/core";
import type { z } from "zod";

/** Parses extension configuration with a classified ACP validation error. */
export function parseExtensionConfig<T>(provider: string, schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new ValidationError(`Invalid ${provider} extension configuration`, {
      cause: error,
      details: { issues: error instanceof Error ? error.message : String(error) },
      provider,
      stage: "validation",
    });
  }
}
