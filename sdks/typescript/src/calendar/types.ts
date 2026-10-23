import type { ActionDefinition } from "../types.js";

/** Input accepted by the calendar.create action. */
export interface CalendarCreateInput {
  /** Attendee identifiers, passed to the calendar backend unmodified. */
  attendees?: string[];
  /** Asks the backend to attach a video conference link. Backends without support may ignore it. */
  conference?: boolean;
  /** Free-text body of the event. */
  description?: string;
  /** End time as a string; this package does not parse it, so use the format your backend expects. */
  end: string;
  /** Start time as a string; this package does not parse it, so use the format your backend expects. */
  start: string;
  /** IANA time zone name for `start` and `end`, such as `Europe/Lisbon`. Not validated here. */
  timezone?: string;
  /** Event title. Must be non-empty. */
  title: string;
}

/**
 * Input accepted by the calendar.update action. Only `eventId` is required; every other
 * field is optional and, when present, must satisfy the same rules as `CalendarCreateInput`.
 */
export interface CalendarUpdateInput extends Partial<CalendarCreateInput> {
  /** Backend identifier of the event to change, as returned in `CalendarEvent.externalId`. */
  eventId: string;
}

/** Input accepted by the calendar.cancel action. */
export interface CalendarCancelInput {
  /** Backend identifier of the event to cancel. */
  eventId: string;
  /** Optional cancellation note, forwarded to the backend when it supports one. */
  reason?: string;
}

/** Provider-neutral result returned by a calendar backend. */
export interface CalendarEvent {
  /** Video conference link, when the backend created one. */
  conferenceUrl?: string;
  /** End time as stored by the backend. */
  end: string;
  /** Backend identifier of the event, used as `eventId` in later update or cancel requests. */
  externalId: string;
  /** Start time as stored by the backend. */
  start: string;
  /** Title as stored by the backend. */
  title: string;
  /** Link to the event in the provider's UI. */
  url?: string;
}

/**
 * Google Calendar, Microsoft Graph, or CalDAV implementation port. Implementations own
 * credentials and transport. Any rejection that is not already an `ActionError` is wrapped as a
 * retryable calendar action failure; an `ActionError` passes through with its classification.
 */
export interface CalendarClient {
  /** Cancels the event. `cancelled: false` means the backend accepted the call but did not cancel. */
  cancel: (input: CalendarCancelInput) => Promise<{ cancelled: boolean }>;
  /** Creates an event and returns the backend's view of it. */
  create: (input: CalendarCreateInput) => Promise<CalendarEvent>;
  /** Applies the provided fields to an existing event and returns the updated view. */
  update: (input: CalendarUpdateInput) => Promise<CalendarEvent>;
}

/** Action bundle registered through `openChannel({ actions })`. */
export type CalendarActions = ActionDefinition<unknown, unknown>[];
