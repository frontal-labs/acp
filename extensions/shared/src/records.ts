import { ValidationError } from "@acp/core";

import type { ProviderRecord } from "./types.js";

/** Converts unknown provider input to a JSON object or raises a classified error. */
export function asRecord(value: unknown, provider: string): ProviderRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`Invalid ${provider} provider payload`, {
      provider,
      stage: "validation",
    });
  }
  return value as ProviderRecord;
}

/** Reads an optional string field from a provider object. */
export function optionalString(record: ProviderRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Reads a required string field from a provider object. */
export function requiredString(record: ProviderRecord, key: string, provider: string): string {
  const value = optionalString(record, key);
  if (!value) {
    throw new ValidationError(`${provider} payload is missing ${key}`, {
      provider,
      stage: "validation",
    });
  }
  return value;
}

/** Reads a nested object field from a provider object. */
export function optionalRecord(value: unknown): ProviderRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as ProviderRecord;
}

/** Reads an array field from a provider object. */
export function records(value: unknown): ProviderRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is ProviderRecord => Boolean(optionalRecord(item)))
    : [];
}

/** Reads text from a value that may be a provider text object. */
export function textValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  const record = optionalRecord(value);
  return optionalString(record ?? {}, "text") ?? optionalString(record ?? {}, "content") ?? "";
}
