import { create } from "@bufbuild/protobuf";
import { ValidationError } from "@frontal-labs/open-channel-core";
import {
  createEvent,
  eventFromBinary,
  eventFromJson,
  eventToBinary,
  eventToJson,
  MessageReceivedSchema,
} from "@frontal-labs/open-channel-protocol";
import {
  createTestEvent,
  createTestHuman,
  createTestMessageReceived,
} from "@frontal-labs/open-channel-testing";
import { describe, expect, it } from "vitest";

describe("OCP event envelope", () => {
  it("round-trips through ProtoJSON and binary protobuf", () => {
    const event = createTestEvent({
      actor: createTestHuman("human:gabriel", "Gabriel"),
      eventId: "evt-1",
      payload: {
        case: "messageReceived",
        value: create(MessageReceivedSchema, {
          metadata: { thread: "t-1" },
          text: "Hello from a channel",
        }),
      },
    });

    const json = eventToJson(event);
    const jsonRoundTrip = eventFromJson(json);
    const binaryRoundTrip = eventFromBinary(eventToBinary(event));

    expect(jsonRoundTrip.eventId).toBe("evt-1");
    expect(jsonRoundTrip.payload.case).toBe("messageReceived");
    expect(binaryRoundTrip.payload.case).toBe("messageReceived");
    if (binaryRoundTrip.payload.case === "messageReceived") {
      expect(binaryRoundTrip.payload.value.text).toBe("Hello from a channel");
    }
  });

  it("rejects a payload that does not match its event type", () => {
    expect(() =>
      createEvent({
        eventType: "message.sent",
        payload: {
          case: "messageReceived",
          value: createTestMessageReceived("wrong payload"),
        },
      }),
    ).toThrow("requires payload case messageSent");
  });

  it("validates untrusted ProtoJSON with Zod before decoding", () => {
    expect(() => eventFromJson({ eventType: 42 })).toThrow(ValidationError);
    expect(() =>
      createEvent({
        eventType: "message.received",
        payload: { case: "unknown", value: {} } as never,
      }),
    ).toThrow(ValidationError);
  });
});
