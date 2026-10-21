import type { ActionResult, OcpHooks } from "@frontal-labs/open-channel";
import type { DeliveryReceipt } from "@frontal-labs/open-channel-adapter";
import type { EventEnvelope } from "@frontal-labs/open-channel-protocol";

/** Minimal structural span port compatible with OpenTelemetry API spans. */
export interface OcpSpan {
  end: () => void;
  recordException?: (error: unknown) => void;
  setAttribute?: (key: string, value: string | number | boolean) => void;
}

/** Minimal structural tracer port compatible with OpenTelemetry API tracers. */
export interface OcpTracer {
  startActiveSpan: <T>(name: string, callback: (span: OcpSpan) => T) => T;
}

/** Minimal structural counter port compatible with OpenTelemetry meters. */
export interface OcpCounter {
  add: (value: number, attributes?: Record<string, string | number | boolean>) => void;
}

/** Tracer and optional counters used to instrument OCP activity. */
export interface OpenTelemetryOptions {
  counters?: Partial<Record<"actions" | "deliveries" | "events" | "errors", OcpCounter>>;
  tracer: OcpTracer;
}

/** OCP hooks that record spans and metrics through OpenTelemetry. */
export type OpenTelemetryHooks = OcpHooks;

/** Callback invoked for each OCP event envelope. */
export type EventObserver = (event: EventEnvelope) => void | Promise<void>;
/** Callback invoked for each action result. */
export type ActionObserver = (result: ActionResult<unknown>) => void | Promise<void>;
/** Callback invoked for each delivery receipt. */
export type DeliveryObserver = (receipt: DeliveryReceipt) => void | Promise<void>;
