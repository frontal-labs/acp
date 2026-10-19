# Native Rust ACP

This example uses the local Rust SDK crate and demonstrates typed agent
registration, ACP message routing, and a generated ProtoJSON-shaped reply.

## Run

From the repository root:

```bash
cargo run --manifest-path examples/native-rust/Cargo.toml
```

The path dependency keeps this example aligned with the local SDK without
publishing or adding the example to the root workspace.
