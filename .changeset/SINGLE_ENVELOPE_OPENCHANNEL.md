---
"@frontal-labs/open-channel": minor
"@frontal-labs/open-channel-adapter": minor
"@frontal-labs/open-channel-cli": minor
"@frontal-labs/open-channel-core": minor
"@frontal-labs/open-channel-policy": minor
"@frontal-labs/open-channel-protocol": minor
"@frontal-labs/open-channel-runtime": minor
"@frontal-labs/open-channel-testing": minor
---

Breaking: OCP has one envelope and one protocol version, `0.2`.

- The envelope no longer stores `eventType`. The event name is derived from the payload: use `eventType(event)`.
- `createEvent` is now `newEvent`, and it takes no `protocolVersion` or `eventType`.
- `eventToJson` / `eventFromJson` / `eventToBinary` / `eventFromBinary` are now `toJson` / `fromJson` / `toBinary` / `fromBinary`. Binary decoding takes no version argument.
- `createOcp()` is now `openChannel()`, and `defineAction()` is now `action()`. The type `OcpApp` is now `OpenChannel`, and the `Ocp*` types are `OpenChannel*`.
- Runtime options are unchanged: `eventStore` remains the name on `OpenChannelRuntime`. The SDK option is `store`.
- `listAgentCards()` is now `agentCards()`, `registerAgent` / `registerAction` / `registerChannel` are now `addAgent` / `addAction` / `addChannel`, and `context.actions.request` is now `ctx.request`.
- Protobuf packages are `ocp.api` and `ocp.types` (previously `ocp.v1.*`, `ocp.v2.*`). Field numbers are unchanged, and field 2 (`event_type`) is reserved.

Migration: rename the imports, drop `eventType` and `protocolVersion` from event input, and call `eventType(event)` where you read the name. Stored ProtoJSON that contains `eventType` must be re-serialized from the typed builders.
