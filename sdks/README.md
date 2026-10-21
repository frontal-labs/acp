# ACP SDKs

The TypeScript, Python, and Rust distributions use the common package name
`acp-sdk` in their respective registries. Their import/module identifiers are
language-specific:

| SDK | Distribution | Import/module | Primary API |
| --- | --- | --- | --- |
| [`typescript/`](./typescript/) | npm `acp-sdk` | `acp-sdk` | `createAcp`, `AgentHost` |
| [`python/`](./python/) | PyPI `acp-sdk` | `acp` | `AcpApp`, `AgentHost` |
| [`rust/`](./rust/) | crates.io `acp-sdk` | `acp_sdk` | `AcpAppBuilder`, `AgentHost` |

All SDKs expose one event API for both wire versions: `0.2` is the canonical
envelope in `proto/v2`, and `0.1` (the default) remains available from `proto/v1`.
Generated bindings live under `proto/gen`.
They expose transport-neutral application APIs; provider SDKs,
credentials, and framework-specific orchestration belong in adapters or the
opt-in examples.

Install the SDK for the language you use:

```bash
pnpm add acp-sdk
python -m pip install acp-sdk
cargo add acp-sdk
```
