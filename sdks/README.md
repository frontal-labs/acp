# OCP SDKs

The TypeScript, Python, and Rust distributions use the common package name
`open-channel` in their respective registries (npm publishes it under the
`@frontal-labs` scope). Their import/module identifiers are
language-specific:

| SDK | Distribution | Import/module | Primary API |
| --- | --- | --- | --- |
| [`typescript/`](./typescript/) | npm `@frontal-labs/open-channel` | `@frontal-labs/open-channel` | `openChannel`, `AgentHost` |
| [`python/`](./python/) | PyPI `open-channel` | `open_channel` | `OpenChannel`, `AgentHost` |
| [`rust/`](./rust/) | crates.io `open-channel` | `open_channel` | `OpenChannelBuilder`, `AgentHost` |

All SDKs expose one event API for both wire versions: `0.2` is the canonical
envelope in `proto/ocp`. There is one envelope and one protocol version, `0.2`.
Generated bindings live under `proto/gen`.
They expose transport-neutral application APIs; provider SDKs,
credentials, and framework-specific orchestration belong in adapters or the
opt-in examples.

Install the SDK for the language you use:

```bash
pnpm add @frontal-labs/open-channel
python -m pip install open-channel
cargo add open-channel
```
