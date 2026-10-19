import type { AcpHooks } from "acp-sdk";

import type { OpenTelemetryOptions } from "./types.js";

function eventAttributes(event: { eventId: string; eventType: string; protocolVersion: string }) {
  return {
    "acp.event_id": event.eventId,
    "acp.event_type": event.eventType,
    "acp.protocol_version": event.protocolVersion,
  };
}

/** Creates SDK hooks that emit provider-neutral OpenTelemetry spans and counters. */
export function createOpenTelemetryHooks(options: OpenTelemetryOptions): AcpHooks {
  return {
    onActionCompleted: (result) => {
      options.counters?.actions?.add(1, { status: result.status });
    },
    onActionStarted: (action) => {
      options.tracer.startActiveSpan("acp.action", (span) => {
        span.setAttribute?.("acp.action", action.type);
        span.setAttribute?.("acp.action_id", action.actionId);
        span.end();
      });
    },
    onDelivery: (receipt) => {
      options.counters?.deliveries?.add(1, { provider: receipt.provider });
      options.tracer.startActiveSpan("acp.delivery", (span) => {
        span.setAttribute?.("acp.provider", receipt.provider);
        span.setAttribute?.("acp.event_id", receipt.eventId);
        if (receipt.externalId) {
          span.setAttribute?.("acp.external_id", receipt.externalId);
        }
        span.end();
      });
    },
    onError: (error) => {
      options.counters?.errors?.add(1);
      options.tracer.startActiveSpan("acp.error", (span) => {
        span.recordException?.(error);
        span.end();
      });
    },
    onEventAccepted: (event) => {
      options.counters?.events?.add(1, { event_type: event.eventType });
      options.tracer.startActiveSpan("acp.event.accepted", (span) => {
        for (const [key, value] of Object.entries(eventAttributes(event))) {
          span.setAttribute?.(key, value);
        }
        span.end();
      });
    },
    onEventProcessed: (event) => {
      options.tracer.startActiveSpan("acp.event.processed", (span) => {
        for (const [key, value] of Object.entries(eventAttributes(event))) {
          span.setAttribute?.(key, value);
        }
        span.end();
      });
    },
  };
}
