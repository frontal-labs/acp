# @frontal-labs/open-channel-protocol

Canonical OCP protobuf schema, generated multi-language bindings, event builders, event validation, and ProtoJSON/binary serialization helpers.

There is one event API for both protocol versions. `createEvent`, the typed builders (`messageReceived`, `messageSent`, `approvalRequested`, `actionExecuted`, `actionFailed`), and the serialization functions take a `protocolVersion` of `"0.1"` (default) or `"0.2"`. The v0.2 envelope derives event identity from its typed payload oneof instead of storing a second event-type string; `eventTypeOf()` returns the friendly name for either version. Use `isV1Event` and `isV2Event` to narrow an `OcpEvent`.

Runtime boundaries use Zod schemas (`EventInputSchema`, `EventEnvelopeJsonSchema`, and `EventPayloadInputSchema`) before values are decoded into generated protobuf messages. Protocol failures use the classified errors exported by `@frontal-labs/open-channel-core`.

## Development

```bash
pnpm generate
pnpm --filter @frontal-labs/open-channel-protocol build
pnpm proto:lint
```

Edit `proto/v1` or `proto/v2`, then regenerate bindings. TypeScript, Python, and Rust outputs live under `proto/gen/{typescript,python,rust}` and are excluded from Ultracite formatting checks.
