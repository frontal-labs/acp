import type { PolicyContext, PolicyDecision } from "@acp/policy";

export interface CedarEvaluator {
  evaluate: (context: PolicyContext) => PolicyDecision;
}

export interface CedarPolicyOptions {
  evaluator: CedarEvaluator;
}
