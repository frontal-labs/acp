import type { ActionDefinition } from "acp-sdk";

/** Input accepted by the calendar.create action. */
export interface CalendarCreateInput {
  attendees?: string[];
  conference?: boolean;
  description?: string;
  end: string;
  start: string;
  timezone?: string;
  title: string;
}

/** Input accepted by the calendar.update action. */
export interface CalendarUpdateInput extends Partial<CalendarCreateInput> {
  eventId: string;
}

/** Input accepted by the calendar.cancel action. */
export interface CalendarCancelInput {
  eventId: string;
  reason?: string;
}

/** Provider-neutral result returned by a calendar backend. */
export interface CalendarEvent {
  conferenceUrl?: string;
  end: string;
  externalId: string;
  start: string;
  title: string;
  url?: string;
}

/** Google Calendar, Microsoft Graph, or CalDAV implementation port. */
export interface CalendarClient {
  cancel: (input: CalendarCancelInput) => Promise<{ cancelled: boolean }>;
  create: (input: CalendarCreateInput) => Promise<CalendarEvent>;
  update: (input: CalendarUpdateInput) => Promise<CalendarEvent>;
}

/** Action bundle registered through `createAcp({ actions })`. */
export type CalendarActions = ActionDefinition<unknown, unknown>[];
