# OCP SDKs

The TypeScript, Python, and Rust distributions all use the package name
`openchannel` in their respective registries. Their import identifier is also
`openchannel`:

| SDK                            | Distribution                     | Import/module                | Primary API                       |
| ------------------------------ | -------------------------------- | ---------------------------- | --------------------------------- |
| [`typescript/`](./typescript/) | npm `openchannel` | `openchannel` | `openChannel`, `AgentHost`        |
| [`python/`](./python/)         | PyPI `openchannel`              | `openchannel`               | `OpenChannel`, `AgentHost`        |
| [`rust/`](./rust/)             | crates.io `openchannel`         | `openchannel`               | `OpenChannelBuilder`, `AgentHost` |

All SDKs expose one event API for both wire versions: `2.0` is the canonical
envelope in `proto/ocp`. There is one envelope and one protocol version, `2.0`.
Generated bindings live under `proto/gen`.
They expose transport-neutral application APIs; provider SDKs,
credentials, and framework-specific orchestration belong in adapters or the
opt-in examples.

Install the SDK for the language you use:

```bash
pnpm add openchannel
python -m pip install openchannel
cargo add openchannel
```
