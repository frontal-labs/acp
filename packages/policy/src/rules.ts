import type {
  PolicyContext,
  PolicyDecision,
  PolicyEngine,
  PolicyRule,
  RuleBasedPolicyOptions,
} from "./types.js";

/** Evaluates ordered rules and falls back to a configurable default decision. */
export class RuleBasedPolicyEngine implements PolicyEngine {
  private readonly rules: PolicyRule[];
  private readonly defaultAllowed: boolean;
  private readonly defaultReason: string;

  constructor(options: RuleBasedPolicyOptions) {
    this.rules = options.rules;
    this.defaultAllowed = options.defaultAllowed ?? false;
    this.defaultReason = options.defaultReason ?? "No matching policy rule";
  }

  evaluate(context: PolicyContext): PolicyDecision {
    const rule = this.rules.find((candidate) => {
      if (candidate.actionType !== context.actionType) {
        return false;
      }
      if (candidate.recipientId && candidate.recipientId !== context.recipient?.id) {
        return false;
      }
      if (candidate.recipientType && candidate.recipientType !== context.recipient?.type) {
        return false;
      }
      return true;
    });

    if (!rule) {
      return {
        allowed: this.defaultAllowed,
        approvalRequired: false,
        policyId: "default",
        reason: this.defaultReason,
      };
    }

    return {
      allowed: rule.allowed,
      approvalRequired: rule.allowed && (rule.requiresApproval ?? false),
      policyId: rule.id,
      reason: rule.reason ?? (rule.allowed ? "Matched allow rule" : "Matched deny rule"),
    };
  }
}
