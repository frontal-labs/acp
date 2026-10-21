import type { PolicyContext, PolicyDecision } from "@acp/policy";

/** Synchronous Cedar policy evaluator port; implementations wrap the Cedar engine. */
export interface CedarEvaluator {
  evaluate: (context: PolicyContext) => PolicyDecision;
}

/** Policy engine options that supply a Cedar evaluator. */
export interface CedarPolicyOptions {
  evaluator: CedarEvaluator;
}
