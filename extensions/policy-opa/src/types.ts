import type { PolicyContext, PolicyDecision } from "@frontal-labs/open-channel-policy";

/** Synchronous OPA evaluation port used for OCP policy decisions. */
export interface OpaTransport {
  /**
   * Evaluates a policy input synchronously.
   *
   * The current OCP PolicyEngine contract is synchronous. A remote OPA client
   * should therefore provide a local cache or a synchronous embedding at this
   * boundary; an async transport can be added when the core contract grows an
   * async policy hook.
   */
  evaluate: (input: PolicyContext) => unknown;
}

/** Options for the OPA-backed policy engine. */
export interface OpaPolicyOptions {
  defaultDecision?: PolicyDecision;
  packageId?: string;
  transport: OpaTransport;
}
