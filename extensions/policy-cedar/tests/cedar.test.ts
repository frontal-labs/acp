import { describe, expect, it } from "vitest";
import { createCedarPolicyEngine } from "../src/index.js";

describe("@frontal-labs/open-channel-ext-policy-cedar", () => {
  it("adapts a Cedar decision to PolicyEngine", () => {
    const engine = createCedarPolicyEngine({
      evaluator: {
        evaluate: () => ({
          allowed: true,
          approvalRequired: true,
          policyId: "cedar",
          reason: "review",
        }),
      },
    });
    expect(engine.evaluate({ actionType: "test", actor: {} as never })).toMatchObject({
      allowed: true,
      approvalRequired: true,
    });
  });
});
