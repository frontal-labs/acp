---
"@frontal-labs/open-channel": minor
"@frontal-labs/open-channel-adapter": minor
"@frontal-labs/open-channel-cli": minor
"@frontal-labs/open-channel-core": minor
"@frontal-labs/open-channel-ext-a2a": minor
"@frontal-labs/open-channel-ext-calendar": minor
"@frontal-labs/open-channel-ext-directory": minor
"@frontal-labs/open-channel-ext-email": minor
"@frontal-labs/open-channel-ext-google-chat": minor
"@frontal-labs/open-channel-ext-mcp": minor
"@frontal-labs/open-channel-ext-microsoft-teams": minor
"@frontal-labs/open-channel-ext-opentelemetry": minor
"@frontal-labs/open-channel-ext-policy-cedar": minor
"@frontal-labs/open-channel-ext-policy-opa": minor
"@frontal-labs/open-channel-ext-postgres": minor
"@frontal-labs/open-channel-ext-shared": minor
"@frontal-labs/open-channel-ext-slack": minor
"@frontal-labs/open-channel-ext-whatsapp": minor
"@frontal-labs/open-channel-policy": minor
"@frontal-labs/open-channel-protocol": minor
"@frontal-labs/open-channel-runtime": minor
---

Rename the project to OpenChannel Protocol (OCP). The SDK distributions are now `open-channel` on crates.io and PyPI and `@frontal-labs/open-channel` on npm (npm requires the scope for this name); the Python import is `open_channel` and the Rust crate is `open_channel`. The CLI is `@frontal-labs/open-channel-cli` with the `ocp` binary. The internal packages moved from `@acp/*` to `@frontal-labs/open-channel-*`.

Migration: rename imports (`createAcp` becomes `createOcp`, `AcpRuntime` becomes `OcpRuntime`, `AcpError` becomes `OcpError`, and the Python `acp` module becomes `open_channel`). Rename `ACP_*` environment variables and exported constants to `OCP_*` (for example `OCP_POSTGRES_URL` and `OCP_PROTOCOL_VERSION`), and the `ACP_*` error codes to `OCP_*`.

Wire and storage identifiers also change: the protobuf packages are `ocp.v1` and `ocp.v2` (previously `acp.v1` and `acp.v2`), telemetry attributes and extension keys use the `ocp.*` prefix (for example `ocp.provider`), and the PostgreSQL tables are `ocp_events` and `ocp_actions`. Existing v0.1 stored events, telemetry dashboards, and database tables need a migration, and consumers that match the old `acp.*` keys or type names must be updated.

Approval authority: the Python SDK's `approve()` and `deny()` now require the approver and reject any actor other than the designated approver with `AuthorizationError` (`OCP_AUTHORIZATION`). The designated approver comes from `PolicyDecision.approver`, or from the new `default_approver` app option, which defaults to the runtime actor. Previously any caller could approve or deny a pending action. A rejected attempt leaves the approval pending. The TypeScript runtime already enforced this check.
