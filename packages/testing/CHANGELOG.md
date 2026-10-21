# @frontal-labs/open-channel-testing

## 3.0.0

### Major Changes

- [#12](https://github.com/frontal-labs/open-channel/pull/12) [`d7d7732`](https://github.com/frontal-labs/open-channel/commit/d7d77325aa02e5b4d9aca2a60adcdae4ebf932cc) Thanks [@gabrielvfonseca](https://github.com/gabrielvfonseca)! - Breaking: OCP has one envelope and one protocol version, `2.0`.

  - The envelope no longer stores `eventType`. The event name is derived from the payload: use `eventType(event)`.
  - `createEvent` is now `newEvent`, and it takes no `protocolVersion` or `eventType`.
  - `eventToJson` / `eventFromJson` / `eventToBinary` / `eventFromBinary` are now `toJson` / `fromJson` / `toBinary` / `fromBinary`. Binary decoding takes no version argument.
  - `createOcp()` is now `openChannel()`, and `defineAction()` is now `action()`. The type `OcpApp` is now `OpenChannel`, and the `Ocp*` types are `OpenChannel*`.
  - Runtime options are unchanged: `eventStore` remains the name on `OpenChannelRuntime`. The SDK option is `store`.
  - `listAgentCards()` is now `agentCards()`, `registerAgent` / `registerAction` / `registerChannel` are now `addAgent` / `addAction` / `addChannel`, and `context.actions.request` is now `ctx.request`.
  - Protobuf packages are `ocp.api` and `ocp.types`. Field numbers are unchanged, and field 2 (`event_type`) is reserved.

  Migration: rename the imports, drop `eventType` and `protocolVersion` from event input, and call `eventType(event)` where you read the name. Stored ProtoJSON that contains `eventType` must be re-serialized from the typed builders.

### Patch Changes

- Updated dependencies [[`d7d7732`](https://github.com/frontal-labs/open-channel/commit/d7d77325aa02e5b4d9aca2a60adcdae4ebf932cc)]:
  - @frontal-labs/open-channel-core@3.0.0
  - @frontal-labs/open-channel-protocol@3.0.0

## 1.0.0

### Minor Changes

- [#1](https://github.com/frontal-labs/open-channel/pull/1) [`315729b`](https://github.com/frontal-labs/open-channel/commit/315729bbcc8cd2ecf28edc928c1d5741ada7e424) Thanks [@gabrielvfonseca](https://github.com/gabrielvfonseca)! - Remove in-memory implementations from production packages. `eventStore` is now required for `OcpRuntime` and `createOcp()`; there is no implicit storage. The in-memory event bus, channel adapter, and event store moved to `@frontal-labs/open-channel-testing` as `createTestEventBus()`, `createTestChannelAdapter()`, and `createTestEventStore()`. The test channel provider is renamed from `"memory"` to `"test"`.

### Patch Changes

- Updated dependencies [[`ba50acf`](https://github.com/frontal-labs/open-channel/commit/ba50acfa54268c84ccc60e9c73d8956988dd7650), [`232c8bf`](https://github.com/frontal-labs/open-channel/commit/232c8bf7134a950b5a7c5697d7472bda0e77fac4), [`315729b`](https://github.com/frontal-labs/open-channel/commit/315729bbcc8cd2ecf28edc928c1d5741ada7e424), [`29b2f5f`](https://github.com/frontal-labs/open-channel/commit/29b2f5ff72f82ab130f0f66e9bb38b87ca7ef913)]:
  - @frontal-labs/open-channel-core@1.0.0
  - @frontal-labs/open-channel-protocol@1.0.0
