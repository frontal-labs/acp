---
"@acp/runtime": patch
---

Approval decisions, expiries, and requests can no longer be injected through `process()`. Channel ingress and other callers reach `process()`, so an `approval.granted` or `approval.denied` event from anyone other than the named approver used to resolve a pending approval, an `approval.expired` event could trigger escalation, and an `approval.requested` event could replace a pending approval's approver. `process()` now throws `AuthorizationError` for every `approval.*` lifecycle event. Requests, decisions, and expiries are produced only by `submitAction()`, `decideApproval()`, and the runtime's expiry timer.
