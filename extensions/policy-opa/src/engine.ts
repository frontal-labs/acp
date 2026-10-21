import { TransportError } from "@frontal-labs/open-channel-core";
import type {
  PolicyContext,
  PolicyDecision,
  PolicyEngine,
} from "@frontal-labs/open-channel-policy";

import type { OpaPolicyOptions } from "./types.js";

function decision(value: unknown, fallback: PolicyDecision): PolicyDecision {
  if (value === null || typeof value !== "object") {
    return fallback;
  }
  const record: Partial<Record<string, unknown>> = { ...value };
  return {
    allowed: record.allowed === true,
    approvalRequired: record.approvalRequired === true,
    policyId: typeof record.policyId === "string" ? record.policyId : fallback.policyId,
    reason: typeof record.reason === "string" ? record.reason : fallback.reason,
  };
}

/** PolicyEngine backed by a host-supplied OPA transport. */
export class OpaPolicyEngine implements PolicyEngine {
  private readonly fallback: PolicyDecision;
  private readonly options: OpaPolicyOptions;

  constructor(options: OpaPolicyOptions) {
    this.options = options;
    this.fallback = options.defaultDecision ?? {
      allowed: false,
      approvalRequired: false,
      policyId: "opa:default-deny",
      reason: "OPA did not return an allow decision",
    };
  }

  evaluate(context: PolicyContext): PolicyDecision {
    try {
      const response = this.options.transport.evaluate(context);
      return decision(response, this.fallback);
    } catch (error) {
      throw new TransportError("OPA policy evaluation failed", {
        cause: error,
        provider: "opa",
        retryable: true,
        stage: "policy",
      });
    }
  }
}

/** Creates a PolicyEngine-compatible adapter for synchronous OPA decision ports. */
export function createOpaPolicyEngine(options: OpaPolicyOptions): PolicyEngine {
  const engine = new OpaPolicyEngine(options);
  return {
    evaluate(context) {
      return engine.evaluate(context);
    },
  };
}
