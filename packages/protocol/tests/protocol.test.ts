import { create } from "@bufbuild/protobuf";
import { ValidationError } from "@frontal-labs/open-channel-core";
import { describe, expect, it } from "vitest";
import {
  ActionRequestSchema,
  ActorRefSchema,
  ActorType,
  actionExecuted,
  approvalRequested,
  createEvent,
  eventFromBinary,
  eventFromJson,
  eventToBinary,
  eventToJson,
  eventTypeOf,
  isV1Event,
  isV2Event,
  MessageReceivedSchema,
  messageReceived,
  parseEvent,
  validateEvent,
} from "../src/index.js";

const message = create(MessageReceivedSchema, { text: "hello" });

describe("@frontal-labs/open-channel-protocol", () => {
  it("round-trips a v0.1 event through ProtoJSON and binary protobuf", () => {
    const event = createEvent({
      actor: create(ActorRefSchema, { id: "human:test", type: ActorType.HUMAN }),
      eventId: "protocol-test",
      eventType: "message.received",
      payload: { case: "messageReceived", value: message },
    });

    expect(isV1Event(event)).toBe(true);
    expect(eventFromJson(eventToJson(event)).eventId).toBe("protocol-test");
    expect(eventFromBinary(eventToBinary(event)).payload.case).toBe("messageReceived");
  });

  it("rejects unsupported or mismatched event input", () => {
    expect(() => eventFromJson({ eventType: 42 })).toThrow(ValidationError);
    expect(() =>
      createEvent({
        eventType: "message.sent",
        payload: { case: "messageReceived", value: create(MessageReceivedSchema, { text: "x" }) },
      }),
    ).toThrow("requires payload case messageSent");
  });

  it("builds v0.2 envelopes through the same createEvent API as v0.1", () => {
    const event = createEvent({
      eventId: "v2-protocol-test",
      eventType: "message.received",
      payload: { case: "messageReceived", value: message },
      protocolVersion: "0.2",
    });

    expect(isV2Event(event)).toBe(true);
    expect(event.protocolVersion).toBe("0.2");
    expect(eventTypeOf(event)).toBe("message.received");
    expect(eventToJson(event)).not.toHaveProperty("eventType");
    expect(eventFromJson(eventToJson(event)).eventId).toBe("v2-protocol-test");
    expect(eventFromBinary(eventToBinary(event), { protocolVersion: "0.2" }).eventId).toBe(
      "v2-protocol-test",
    );
  });

  it("rejects a v0.2 payload that does not match its event name", () => {
    expect(() =>
      createEvent({
        eventType: "message.sent",
        payload: { case: "messageReceived", value: message },
        protocolVersion: "0.2",
      }),
    ).toThrow("requires payload case messageSent");
  });

  it("requires the envelope shape and protocol version to agree", () => {
    const v1 = createEvent({
      eventType: "message.received",
      payload: { case: "messageReceived", value: message },
    });
    const v2 = createEvent({
      eventType: "message.received",
      payload: { case: "messageReceived", value: message },
      protocolVersion: "0.2",
    });

    expect(() => validateEvent({ ...v1, protocolVersion: "0.2" })).toThrow(
      "v0.1 envelope requires protocol_version 0.1",
    );
    expect(() => validateEvent({ ...v2, protocolVersion: "0.1" })).toThrow(
      "v0.2 envelope requires protocol_version 0.2",
    );
  });

  it("derives approval and policy names from the payload for v0.2", () => {
    const action = create(ActionRequestSchema, {
      actionId: "action:derived",
      parameters: { input: "{}" },
      target: "customer:1",
      type: "customer.reply",
    });
    const approval = approvalRequested({
      agent: create(ActorRefSchema, { id: "agent:v2", type: ActorType.AGENT }),
      approvalId: "approval:derived",
      approver: create(ActorRefSchema, { id: "human:v2", type: ActorType.HUMAN }),
      deadline: new Date("2030-01-01T00:00:00Z"),
      protocolVersion: "0.2",
      reason: "review",
      requestedAction: action,
    });

    expect(eventTypeOf(approval)).toBe("approval.requested");
    expect(eventTypeOf(actionExecuted({ action, protocolVersion: "0.2", result: "ok" }))).toBe(
      "action.executed",
    );
  });

  it("uses one builder API for both protocol versions", () => {
    const v1 = messageReceived({ eventId: "builder-v1", text: "hello" });
    const v2 = messageReceived({ eventId: "builder-v2", protocolVersion: "0.2", text: "hello" });

    expect(isV1Event(v1)).toBe(true);
    expect(isV2Event(v2)).toBe(true);
    expect(eventTypeOf(v1)).toBe(eventTypeOf(v2));
    expect(parseEvent(eventToJson(v2)).protocolVersion).toBe("0.2");
  });

  it("requires an explicit version to decode binary bytes for v0.2", () => {
    const binary = eventToBinary(messageReceived({ protocolVersion: "0.2", text: "hi" }));

    expect(() => parseEvent(binary)).toThrow();
    expect(parseEvent(binary, { protocolVersion: "0.2" }).protocolVersion).toBe("0.2");
  });
});
