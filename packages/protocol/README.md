# @acp/protocol

Canonical ACP protobuf schema, generated multi-language bindings, event builders, event validation, and ProtoJSON/binary serialization helpers.

New integrations should use the v2 envelope helpers (`createV2Event`, `v2EventType`, and the `v2Event*` serialization functions). The v2 envelope derives event identity from its typed payload oneof instead of storing a second event-type string. The v1 helpers remain available for legacy consumers.

Runtime boundaries use Zod schemas (`EventInputSchema`, `EventEnvelopeJsonSchema`, and `EventPayloadInputSchema`) before values are decoded into generated protobuf messages. Protocol failures use the classified errors exported by `@acp/core`.

## Development

```bash
pnpm generate
pnpm --filter @acp/protocol build
pnpm proto:lint
```

Edit `proto/v1` or `proto/v2`, then regenerate bindings. TypeScript, Python, and Rust outputs live under `proto/gen/{typescript,python,rust}` and are excluded from Ultracite formatting checks.
