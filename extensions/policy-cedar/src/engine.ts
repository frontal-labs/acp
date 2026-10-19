import type { PolicyContext, PolicyDecision, PolicyEngine } from "@acp/policy";

import type { CedarEvaluator, CedarPolicyOptions } from "./types.js";

/** Adapts a local Cedar evaluator to ACP's PolicyEngine contract. */
export class CedarPolicyEngine implements PolicyEngine {
  private readonly evaluator: CedarEvaluator;

  constructor(options: CedarPolicyOptions) {
    this.evaluator = options.evaluator;
  }

  evaluate(context: PolicyContext): PolicyDecision {
    return this.evaluator.evaluate(context);
  }
}

/** Creates an ACP PolicyEngine backed by a Cedar evaluator. */
export function createCedarPolicyEngine(options: CedarPolicyOptions): PolicyEngine {
  return new CedarPolicyEngine(options);
}
