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

Events for both protocol versions use one set of constructors. The version is the
first argument; `ProtocolVersion::default()` is `0.1`:

```rust
use acp_sdk::{message_received, event_type_of, EventEnvelope, ProtocolVersion};

let v1 = message_received(ProtocolVersion::V0_1, "hello"); // stores eventType
let v2 = message_received(ProtocolVersion::V0_2, "hello"); // name derived from payload
assert_eq!(event_type_of(&v2), "message.received");

let bytes = v2.to_binary()?;
let decoded = EventEnvelope::from_binary(&bytes, ProtocolVersion::V0_2)?;
```

Binary protobuf requires the expected version because the bytes carry no discriminator.
Every payload kind (15 event names) encodes to real protobuf in both versions, byte-compatible
with the TypeScript SDK; the parity fixture in `packages/protocol/tests/fixtures` is checked by
`tests/parity.rs`.

Approval, policy, action, task, handoff, and escalation constructors all take the version first:

```rust
use acp_sdk::{approval_requested, ActionInvocation, ActorRef, ProtocolVersion};

let action = ActionInvocation {
    action_id: "action:refund-1".into(),
    input: serde_json::json!({ "amount": 250 }), // sent as parameters["input"] (JSON string)
    action_type: "refund".into(),
    target: "customer:42".into(),
    ..ActionInvocation::default()
};
let approval = approval_requested(
    ProtocolVersion::V0_2,
    &action,
    "approval:refund-1",
    "refund over the agent limit",
    &ActorRef::agent("agent:support", "Support"),
    &approver, // &ActorRef of the human approver
    Some("2030-01-01T00:00:00Z".to_owned()), // deadline, RFC 3339 UTC; None if none
);
```

`approval_decided(version, approval_id, ApprovalOutcome::Granted | Denied, &approver, reason)`
emits `approval.granted` or `approval.denied`. `policy_evaluated(version, allowed,
approval_required, reason, action_type, &recipient, policy_id)` emits `policy.allowed` or
`policy.blocked`. `action_executed` and `action_failed` take the same `&ActionInvocation`.
Timestamps keep the precision the source provides (milliseconds, microseconds, or nanoseconds).

The crate also generates Rust protobuf bindings into `proto/gen/rust` during
the build. The SDK model layer remains ergonomic and transport-neutral while
the generated module is available as `acp_sdk::generated` for integrations
that need the wire types.

## Development

```bash
cargo test --manifest-path sdks/rust/Cargo.toml
```
