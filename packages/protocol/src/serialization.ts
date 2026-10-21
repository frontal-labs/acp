import { ProtocolError, ValidationError } from "@acp/core";
import { fromBinary, fromJson, type JsonValue, toBinary, toJson } from "@bufbuild/protobuf";
import { EventEnvelopeSchema as V2EventEnvelopeSchema } from "../../../proto/gen/typescript/v2/api/events_pb.js";

import { ACP_PROTOCOL_VERSION, type ProtocolVersion } from "./constants.js";
import { type AcpEvent, type EnvelopeFor, isV2Event, validateEvent } from "./events.js";
import { EventEnvelopeSchema } from "./generated.js";
import { parseEventJson } from "./schemas.js";

/** Serializes a validated envelope of either protocol version to ProtoJSON. */
export function eventToJson(event: AcpEvent): JsonValue {
  validateEvent(event);
  if (isV2Event(event)) {
    return toJson(V2EventEnvelopeSchema, event);
  }
  return toJson(EventEnvelopeSchema, event);
}

/**
 * Parses and validates an untrusted ProtoJSON envelope. The protocol version is read from
 * `protocolVersion`; a missing version is treated as v0.1.
 */
export function eventFromJson(value: unknown): AcpEvent {
  let parsed: JsonValue;
  try {
    parsed = parseEventJson(value);
  } catch (error) {
    throw new ValidationError("Invalid ACP ProtoJSON envelope", {
      cause: error,
      details: { issues: error instanceof Error ? error.message : String(error) },
    });
  }
  const isV2 = (parsed as { protocolVersion?: unknown }).protocolVersion === "0.2";
  let event: AcpEvent;
  try {
    event = isV2 ? fromJson(V2EventEnvelopeSchema, parsed) : fromJson(EventEnvelopeSchema, parsed);
  } catch (error) {
    throw new ProtocolError("Unable to decode ACP ProtoJSON envelope", { cause: error });
  }
  validateEvent(event);
  return event;
}

/** Serializes a validated envelope of either protocol version to binary protobuf. */
export function eventToBinary(event: AcpEvent): Uint8Array {
  validateEvent(event);
  if (isV2Event(event)) {
    return toBinary(V2EventEnvelopeSchema, event);
  }
  return toBinary(EventEnvelopeSchema, event);
}

/**
 * Parses and validates a binary protobuf envelope. Binary does not carry a version
 * discriminator, so the expected protocol version is passed explicitly (default v0.1).
 */
export function eventFromBinary<V extends ProtocolVersion = typeof ACP_PROTOCOL_VERSION>(
  value: Uint8Array,
  options: { protocolVersion?: V } = {},
): EnvelopeFor<V> {
  const protocolVersion = options.protocolVersion ?? ACP_PROTOCOL_VERSION;
  let event: AcpEvent;
  try {
    event =
      protocolVersion === "0.2"
        ? fromBinary(V2EventEnvelopeSchema, value)
        : fromBinary(EventEnvelopeSchema, value);
  } catch (error) {
    throw new ProtocolError("Unable to decode ACP binary envelope", { cause: error });
  }
  validateEvent(event);
  return event as EnvelopeFor<V>;
}

/**
 * Parses an untrusted event: ProtoJSON for any object, binary protobuf for bytes.
 * Bytes require `protocolVersion` because binary does not carry it.
 */
export function parseEvent(
  value: unknown,
  options: { protocolVersion?: ProtocolVersion } = {},
): AcpEvent {
  if (value instanceof Uint8Array) {
    return eventFromBinary(value, options);
  }
  return eventFromJson(value);
}
