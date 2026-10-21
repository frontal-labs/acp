# @frontal-labs/open-channel-ext-policy-opa

## 0.2.0

### Minor Changes

- [#7](https://github.com/frontal-labs/open-channel/pull/7) [`232c8bf`](https://github.com/frontal-labs/open-channel/commit/232c8bf7134a950b5a7c5697d7472bda0e77fac4) Thanks [@gabrielvfonseca](https://github.com/gabrielvfonseca)! - Rename the project to OpenChannel Protocol (OCP). The SDK distributions are now `open-channel` on crates.io and PyPI and `@frontal-labs/open-channel` on npm (npm requires the scope for this name); the Python import is `open_channel` and the Rust crate is `open_channel`. The CLI is `@frontal-labs/open-channel-cli` with the `ocp` binary. The internal packages moved from `@acp/*` to `@frontal-labs/open-channel-*`.

  Migration: rename imports (`createAcp` becomes `createOcp`, `AcpRuntime` becomes `OcpRuntime`, `AcpError` becomes `OcpError`, and the Python `acp` module becomes `open_channel`). Rename `ACP_*` environment variables and exported constants to `OCP_*` (for example `OCP_POSTGRES_URL` and `OCP_PROTOCOL_VERSION`), and the `ACP_*` error codes to `OCP_*`.

  Wire and storage identifiers also change: the protobuf packages are `ocp.v1` and `ocp.v2` (previously `acp.v1` and `acp.v2`), telemetry attributes and extension keys use the `ocp.*` prefix (for example `ocp.provider`), and the PostgreSQL tables are `ocp_events` and `ocp_actions`. Existing v0.1 stored events, telemetry dashboards, and database tables need a migration, and consumers that match the old `acp.*` keys or type names must be updated.

  Approval authority: the Python SDK's `approve()` and `deny()` now require the approver and reject any actor other than the designated approver with `AuthorizationError` (`OCP_AUTHORIZATION`). The designated approver comes from `PolicyDecision.approver`, or from the new `default_approver` app option, which defaults to the runtime actor. Previously any caller could approve or deny a pending action. A rejected attempt leaves the approval pending. The TypeScript runtime already enforced this check.

### Patch Changes

- Updated dependencies [[`ba50acf`](https://github.com/frontal-labs/open-channel/commit/ba50acfa54268c84ccc60e9c73d8956988dd7650), [`232c8bf`](https://github.com/frontal-labs/open-channel/commit/232c8bf7134a950b5a7c5697d7472bda0e77fac4), [`315729b`](https://github.com/frontal-labs/open-channel/commit/315729bbcc8cd2ecf28edc928c1d5741ada7e424)]:
  - @frontal-labs/open-channel-core@0.2.0
  - @frontal-labs/open-channel-policy@0.2.0
