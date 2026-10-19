import { describe, expect, it } from "vitest";
import { createCalendarActions } from "../src/index.js";

describe("@acp/ext-calendar", () => {
  it("creates SDK action definitions with Zod validation", () => {
    const actions = createCalendarActions({
      cancel: async () => ({ cancelled: true }),
      create: async (input) => ({
        end: input.end,
        externalId: "event:1",
        start: input.start,
        title: input.title,
      }),
      update: async () => ({ end: "end", externalId: "event:1", start: "start", title: "updated" }),
    });
    expect(actions.map((action) => action.type)).toEqual([
      "calendar.create",
      "calendar.update",
      "calendar.cancel",
    ]);
    expect(() => actions[0]?.validate?.({ end: "end", start: "start", title: "" })).toThrow();
  });
});
