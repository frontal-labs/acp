import { ProtocolError, ValidationError } from "@acp/core";
import { fromBinary, fromJson, type JsonValue, toBinary, toJson } from "@bufbuild/protobuf";
import { validateEvent } from "./events.js";
import { type EventEnvelope, EventEnvelopeSchema } from "./generated.js";
import { parseEventJson } from "./schemas.js";

/** Serializes a validated event to ProtoJSON. */
export function eventToJson(event: EventEnvelope): JsonValue {
  validateEvent(event);
  return toJson(EventEnvelopeSchema, event);
}

/** Parses and validates an untrusted ProtoJSON event envelope. */
export function eventFromJson(value: unknown): EventEnvelope {
  let parsed: JsonValue;
  try {
    parsed = parseEventJson(value);
  } catch (error) {
    throw new ValidationError("Invalid ACP ProtoJSON envelope", {
      cause: error,
      details: { issues: error instanceof Error ? error.message : String(error) },
    });
  }
  let event: EventEnvelope;
  try {
    event = fromJson(EventEnvelopeSchema, parsed);
  } catch (error) {
    throw new ProtocolError("Unable to decode ACP ProtoJSON envelope", { cause: error });
  }
  validateEvent(event);
  return event;
}

/** Serializes a validated event to binary protobuf. */
export function eventToBinary(event: EventEnvelope): Uint8Array {
  validateEvent(event);
  return toBinary(EventEnvelopeSchema, event);
}

/** Parses and validates a binary protobuf event envelope. */
export function eventFromBinary(value: Uint8Array): EventEnvelope {
  let event: EventEnvelope;
  try {
    event = fromBinary(EventEnvelopeSchema, value);
  } catch (error) {
    throw new ProtocolError("Unable to decode ACP binary envelope", { cause: error });
  }
  validateEvent(event);
  return event;
}
