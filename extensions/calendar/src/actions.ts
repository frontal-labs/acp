import { ActionError } from "@acp/core";
import type { ActionDefinition } from "acp-sdk";
import { defineAction } from "acp-sdk";
import { z } from "zod";

import type {
  CalendarActions,
  CalendarCancelInput,
  CalendarClient,
  CalendarCreateInput,
  CalendarUpdateInput,
} from "./types.js";

const CalendarCreateSchema = z.object({
  attendees: z.array(z.string().min(1)).optional(),
  conference: z.boolean().optional(),
  description: z.string().optional(),
  end: z.string().min(1),
  start: z.string().min(1),
  timezone: z.string().optional(),
  title: z.string().min(1),
});

const CalendarUpdateSchema = CalendarCreateSchema.partial().extend({ eventId: z.string().min(1) });
const CalendarCancelSchema = z.object({
  eventId: z.string().min(1),
  reason: z.string().optional(),
});

function calendarActionError(message: string, cause: unknown): ActionError {
  return new ActionError(message, { cause, provider: "calendar", retryable: true });
}

/** Creates the three policy-controlled calendar actions used by ACP agents. */
export function createCalendarActions(client: CalendarClient): CalendarActions {
  const createAction = defineAction<
    CalendarCreateInput,
    Awaited<ReturnType<CalendarClient["create"]>>
  >({
    execute: async (input) => {
      try {
        return await client.create(input);
      } catch (error) {
        throw calendarActionError("Calendar event creation failed", error);
      }
    },
    type: "calendar.create",
    validate: (input) => CalendarCreateSchema.parse(input),
  });
  const updateAction = defineAction<
    CalendarUpdateInput,
    Awaited<ReturnType<CalendarClient["update"]>>
  >({
    execute: async (input) => {
      try {
        return await client.update(input);
      } catch (error) {
        throw calendarActionError("Calendar event update failed", error);
      }
    },
    type: "calendar.update",
    validate: (input) => CalendarUpdateSchema.parse(input),
  });
  const cancelAction = defineAction<CalendarCancelInput, { cancelled: boolean }>({
    execute: async (input) => {
      try {
        return await client.cancel(input);
      } catch (error) {
        throw calendarActionError("Calendar event cancellation failed", error);
      }
    },
    type: "calendar.cancel",
    validate: (input) => CalendarCancelSchema.parse(input),
  });
  return [createAction, updateAction, cancelAction] as CalendarActions;
}

/** Narrows an action bundle to a strongly typed calendar action definition. */
export function calendarAction<TInput, TResult>(
  action: ActionDefinition<TInput, TResult>,
): ActionDefinition<TInput, TResult> {
  return action;
}
