import type { DeliveryReceipt } from "@acp/adapter";
import type { EventEnvelope } from "@acp/protocol";
import type { AcpHooks, ActionResult } from "acp-sdk";

/** Minimal structural span port compatible with OpenTelemetry API spans. */
export interface AcpSpan {
  end: () => void;
  recordException?: (error: unknown) => void;
  setAttribute?: (key: string, value: string | number | boolean) => void;
}

/** Minimal structural tracer port compatible with OpenTelemetry API tracers. */
export interface AcpTracer {
  startActiveSpan: <T>(name: string, callback: (span: AcpSpan) => T) => T;
}

/** Minimal structural counter port compatible with OpenTelemetry meters. */
export interface AcpCounter {
  add: (value: number, attributes?: Record<string, string | number | boolean>) => void;
}

/** Tracer and optional counters used to instrument ACP activity. */
export interface OpenTelemetryOptions {
  counters?: Partial<Record<"actions" | "deliveries" | "events" | "errors", AcpCounter>>;
  tracer: AcpTracer;
}

/** ACP hooks that record spans and metrics through OpenTelemetry. */
export type OpenTelemetryHooks = AcpHooks;

/** Callback invoked for each ACP event envelope. */
export type EventObserver = (event: EventEnvelope) => void | Promise<void>;
/** Callback invoked for each action result. */
export type ActionObserver = (result: ActionResult<unknown>) => void | Promise<void>;
/** Callback invoked for each delivery receipt. */
export type DeliveryObserver = (receipt: DeliveryReceipt) => void | Promise<void>;
