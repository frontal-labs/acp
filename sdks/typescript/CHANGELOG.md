# @frontal-labs/open-channel

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
  - @frontal-labs/open-channel-adapter@3.0.0
  - @frontal-labs/open-channel-core@3.0.0
  - @frontal-labs/open-channel-policy@3.0.0
  - @frontal-labs/open-channel-protocol@3.0.0
  - @frontal-labs/open-channel-runtime@3.0.0

## 1.0.0

### Minor Changes

- [`ba50acf`](https://github.com/frontal-labs/open-channel/commit/ba50acfa54268c84ccc60e9c73d8956988dd7650) Thanks [@gabrielvfonseca](https://github.com/gabrielvfonseca)! - Add the config-first OCP application facade, split channel source/sink contracts, typed action registration and execution, lifecycle hooks, per-conversation handling, and the versioned v2 event envelope helpers.

- [#7](https://github.com/frontal-labs/open-channel/pull/7) [`232c8bf`](https://github.com/frontal-labs/open-channel/commit/232c8bf7134a950b5a7c5697d7472bda0e77fac4) Thanks [@gabrielvfonseca](https://github.com/gabrielvfonseca)! - Rename the project to OpenChannel Protocol (OCP). The SDK distributions are now `open-channel` on crates.io and PyPI and `@frontal-labs/open-channel` on npm (npm requires the scope for this name); the Python import is `open_channel` and the Rust crate is `open_channel`. The CLI is `@frontal-labs/open-channel-cli` with the `ocp` binary. The internal packages moved from `@acp/*` to `@frontal-labs/open-channel-*`.

  Migration: rename imports (`createAcp` becomes `createOcp`, `AcpRuntime` becomes `OcpRuntime`, `AcpError` becomes `OcpError`, and the Python `acp` module becomes `open_channel`). Rename `ACP_*` environment variables and exported constants to `OCP_*` (for example `OCP_POSTGRES_URL` and `OCP_PROTOCOL_VERSION`), and the `ACP_*` error codes to `OCP_*`.

  Wire and storage identifiers also change: the protobuf packages are `ocp.v1` and `ocp.v2` (previously `acp.v1` and `acp.v2`), telemetry attributes and extension keys use the `ocp.*` prefix (for example `ocp.provider`), and the PostgreSQL tables are `ocp_events` and `ocp_actions`. Existing v0.1 stored events, telemetry dashboards, and database tables need a migration, and consumers that match the old `acp.*` keys or type names must be updated.

  Approval authority: the Python SDK's `approve()` and `deny()` now require the approver and reject any actor other than the designated approver with `AuthorizationError` (`OCP_AUTHORIZATION`). The designated approver comes from `PolicyDecision.approver`, or from the new `default_approver` app option, which defaults to the runtime actor. Previously any caller could approve or deny a pending action. A rejected attempt leaves the approval pending. The TypeScript runtime already enforced this check.

- [#1](https://github.com/frontal-labs/open-channel/pull/1) [`315729b`](https://github.com/frontal-labs/open-channel/commit/315729bbcc8cd2ecf28edc928c1d5741ada7e424) Thanks [@gabrielvfonseca](https://github.com/gabrielvfonseca)! - Remove in-memory implementations from production packages. `eventStore` is now required for `OcpRuntime` and `createOcp()`; there is no implicit storage. The in-memory event bus, channel adapter, and event store moved to `@frontal-labs/open-channel-testing` as `createTestEventBus()`, `createTestChannelAdapter()`, and `createTestEventStore()`. The test channel provider is renamed from `"memory"` to `"test"`.

- [#1](https://github.com/frontal-labs/open-channel/pull/1) [`29b2f5f`](https://github.com/frontal-labs/open-channel/commit/29b2f5ff72f82ab130f0f66e9bb38b87ca7ef913) Thanks [@gabrielvfonseca](https://github.com/gabrielvfonseca)! - Unify OCP v0.1 and v0.2 event handling behind one API. `createEvent`, the typed builders (`messageReceived`, `messageSent`, `approvalRequested`, `actionExecuted`, `actionFailed`), and the serialization helpers accept a `protocolVersion` of `"0.1"` (default) or `"0.2"`. `eventTypeOf()` derives the event name for either version. The separate `createV2Event`, `v2EventType`, and `v2Event*` helpers are removed.

  Application handlers registered with `app.on()` are now isolated: a handler that throws is reported through `hooks.onError` instead of interrupting other handlers. `app.stop()` keeps the host attached while draining so in-flight conversations still deliver their replies. The PostgreSQL event store rejects v0.2 envelopes because the runtime persists v0.1 events.

  Binary encoding is real protobuf for every event kind in both versions. A shared parity fixture (`packages/protocol/tests/fixtures/event-parity.json`) is decoded and re-encoded byte-identically by the TypeScript, Python, and Rust SDKs.

### Patch Changes

- Updated dependencies [[`ba50acf`](https://github.com/frontal-labs/open-channel/commit/ba50acfa54268c84ccc60e9c73d8956988dd7650), [`232c8bf`](https://github.com/frontal-labs/open-channel/commit/232c8bf7134a950b5a7c5697d7472bda0e77fac4), [`315729b`](https://github.com/frontal-labs/open-channel/commit/315729bbcc8cd2ecf28edc928c1d5741ada7e424), [`2f6ca43`](https://github.com/frontal-labs/open-channel/commit/2f6ca432c96dc138713a1b167f2496ed3a680ab5), [`29b2f5f`](https://github.com/frontal-labs/open-channel/commit/29b2f5ff72f82ab130f0f66e9bb38b87ca7ef913)]:
  - @frontal-labs/open-channel-adapter@1.0.0
  - @frontal-labs/open-channel-core@1.0.0
  - @frontal-labs/open-channel-protocol@1.0.0
  - @frontal-labs/open-channel-runtime@1.0.0
  - @frontal-labs/open-channel-policy@1.0.0
