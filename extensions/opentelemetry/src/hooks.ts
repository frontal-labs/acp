import { type EventEnvelope, eventType, type OpenChannelHooks } from "@frontal-labs/open-channel";

import type { OpenTelemetryOptions } from "./types.js";

function eventAttributes(event: EventEnvelope) {
  return {
    "ocp.event_id": event.eventId,
    "ocp.event_type": eventType(event),
    "ocp.protocol_version": event.protocolVersion,
  };
}

/** Creates SDK hooks that emit provider-neutral OpenTelemetry spans and counters. */
export function createOpenTelemetryHooks(options: OpenTelemetryOptions): OpenChannelHooks {
  return {
    onActionCompleted: (result) => {
      options.counters?.actions?.add(1, { status: result.status });
    },
    onActionStarted: (action) => {
      options.tracer.startActiveSpan("ocp.action", (span) => {
        span.setAttribute?.("ocp.action", action.type);
        span.setAttribute?.("ocp.action_id", action.actionId);
        span.end();
      });
    },
    onDelivery: (receipt) => {
      options.counters?.deliveries?.add(1, { provider: receipt.provider });
      options.tracer.startActiveSpan("ocp.delivery", (span) => {
        span.setAttribute?.("ocp.provider", receipt.provider);
        span.setAttribute?.("ocp.event_id", receipt.eventId);
        if (receipt.externalId) {
          span.setAttribute?.("ocp.external_id", receipt.externalId);
        }
        span.end();
      });
    },
    onError: (error) => {
      options.counters?.errors?.add(1);
      options.tracer.startActiveSpan("ocp.error", (span) => {
        span.recordException?.(error);
        span.end();
      });
    },
    onEventAccepted: (event) => {
      options.counters?.events?.add(1, { event_type: eventType(event) });
      options.tracer.startActiveSpan("ocp.event.accepted", (span) => {
        for (const [key, value] of Object.entries(eventAttributes(event))) {
          span.setAttribute?.(key, value);
        }
        span.end();
      });
    },
    onEventProcessed: (event) => {
      options.tracer.startActiveSpan("ocp.event.processed", (span) => {
        for (const [key, value] of Object.entries(eventAttributes(event))) {
          span.setAttribute?.(key, value);
        }
        span.end();
      });
    },
  };
}
