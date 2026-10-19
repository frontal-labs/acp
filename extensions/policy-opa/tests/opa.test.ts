import { describe, expect, it } from "vitest";
import { createOpaPolicyEngine } from "../src/index.js";

describe("@acp/ext-policy-opa", () => {
  it("maps a local OPA decision into PolicyEngine", () => {
    const engine = createOpaPolicyEngine({
      transport: { evaluate: () => ({ allowed: true, policyId: "opa:test" }) },
    });
    expect(engine.evaluate({ actionType: "test", actor: {} as never })).toMatchObject({
      allowed: true,
      policyId: "opa:test",
    });
  });
});
