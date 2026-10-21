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

Rename the project to OpenChannel Protocol (OCP). The SDK distributions are now `open-channel` on crates.io and PyPI and `@frontal-labs/open-channel` on npm (npm requires the scope for this name); the Python import is `open_channel` and the Rust crate is `open_channel`. The CLI is `@frontal-labs/open-channel-cli` with the `ocp` binary, and the internal `@acp/*` packages are now `@frontal-labs/open-channel-*`.

Migration: rename imports (`createAcp` becomes `createOcp`, `AcpRuntime` becomes `OcpRuntime`, `AcpError` becomes `OcpError`, and the Python `acp` module becomes `open_channel`); rename `ACP_*` environment variables and exported constants to `OCP_*` (for example `OCP_POSTGRES_URL`, `OCP_PROTOCOL_VERSION`, and the `OCP_*` error codes).

Protocol identifiers are unchanged on purpose: the `acp.v1` and `acp.v2` protobuf packages, the `acp.*` telemetry attributes and `acp.provider` extension keys, and the `acp_events` and `acp_actions` PostgreSQL tables keep their names so existing events, traces, and databases stay compatible.
