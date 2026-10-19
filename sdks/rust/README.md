# acp-sdk

The Rust distribution is published as `acp-sdk` on crates.io. Rust imports use
the generated identifier `acp_sdk`. It provides a synchronous,
transport-neutral agent host with A2A-like agent cards, skills, and typed
message context.

Add the dependency to an application with:

```bash
cargo add acp-sdk
```

For application composition, use `AcpAppBuilder` to register agents, actions, channels, and policy:

```rust
use acp_sdk::{AcpAppBuilder, AgentCard, AgentDefinition};

let mut app = AcpAppBuilder::new()
    .agent(AgentDefinition::new(
        AgentCard::new("agent:support", "Support Agent"),
        |context| {
            context.reply("I am looking into this.");
            Ok(())
        },
    ))?
    .build();

app.start()?;
let result = app.ingest(event)?;
app.stop()?;
```

```rust
use acp_sdk::{AgentCard, AgentDefinition, AgentHost};

let mut host = AgentHost::new();
host.register(AgentDefinition::new(
    AgentCard::new("agent:support", "Support Agent"),
    |context| {
        context.reply("I am looking into this.");
        Ok(())
    },
))?;
let result = host.handle(&event)?;
```

The crate also generates Rust protobuf bindings into `proto/gen/rust` during
the build. The SDK model layer remains ergonomic and transport-neutral while
the generated module is available as `acp_sdk::generated` for integrations
that need the wire types.

## Development

```bash
cargo test --manifest-path sdks/rust/Cargo.toml
```
