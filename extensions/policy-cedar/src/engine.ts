import type {
  PolicyContext,
  PolicyDecision,
  PolicyEngine,
} from "@frontal-labs/open-channel-policy";

import type { CedarEvaluator, CedarPolicyOptions } from "./types.js";

/** Adapts a local Cedar evaluator to OCP's PolicyEngine contract. */
export class CedarPolicyEngine implements PolicyEngine {
  private readonly evaluator: CedarEvaluator;

  constructor(options: CedarPolicyOptions) {
    this.evaluator = options.evaluator;
  }

  evaluate(context: PolicyContext): PolicyDecision {
    return this.evaluator.evaluate(context);
  }
}

/** Creates an OCP PolicyEngine backed by a Cedar evaluator. */
export function createCedarPolicyEngine(options: CedarPolicyOptions): PolicyEngine {
  return new CedarPolicyEngine(options);
}
