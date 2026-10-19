import { ValidationError } from "@acp/core";
import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
  ActorRefSchema,
  ActorType,
  createEvent,
  createV2Event,
  eventFromBinary,
  eventFromJson,
  eventToBinary,
  eventToJson,
  MessageReceivedSchema,
  v2EventFromBinary,
  v2EventFromJson,
  v2EventToBinary,
  v2EventToJson,
  v2EventType,
} from "../src/index.js";

describe("@acp/protocol", () => {
  it("round-trips an event through ProtoJSON and binary protobuf", () => {
    const event = createEvent({
      actor: create(ActorRefSchema, { id: "human:test", type: ActorType.HUMAN }),
      eventId: "protocol-test",
      eventType: "message.received",
      payload: {
        case: "messageReceived",
        value: create(MessageReceivedSchema, { text: "hello" }),
      },
    });

    expect(eventFromJson(eventToJson(event)).eventId).toBe("protocol-test");
    expect(eventFromBinary(eventToBinary(event)).payload.case).toBe("messageReceived");
  });

  it("rejects unsupported or mismatched event input", () => {
    expect(() => eventFromJson({ eventType: 42 })).toThrow(ValidationError);
    expect(() =>
      createEvent({
        eventType: "message.sent",
        payload: {
          case: "messageReceived",
          value: create(MessageReceivedSchema, { text: "wrong" }),
        },
      }),
    ).toThrow("requires payload case messageSent");
  });

  it("round-trips the v2 oneof-discriminated envelope", () => {
    const event = createV2Event({
      eventId: "v2-protocol-test",
      eventType: "message.received",
      payload: {
        case: "messageReceived",
        value: create(MessageReceivedSchema, { text: "hello v2" }),
      },
    });

    expect(v2EventType(event)).toBe("message.received");
    expect(v2EventFromJson(v2EventToJson(event)).eventId).toBe("v2-protocol-test");
    expect(v2EventType(v2EventFromBinary(v2EventToBinary(event)))).toBe("message.received");
  });

  it("rejects a v2 payload that does not match its friendly event name", () => {
    expect(() =>
      createV2Event({
        eventType: "message.sent",
        payload: {
          case: "messageReceived",
          value: create(MessageReceivedSchema, { text: "wrong" }),
        },
      }),
    ).toThrow("requires payload case messageSent");
  });
});
