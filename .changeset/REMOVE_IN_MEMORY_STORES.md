---
"@frontal-labs/open-channel-core": minor
"@frontal-labs/open-channel-adapter": minor
"@frontal-labs/open-channel-runtime": minor
"@frontal-labs/open-channel-testing": minor
"@frontal-labs/open-channel": minor
---

Remove in-memory implementations from production packages. `eventStore` is now required for `OcpRuntime` and `createOcp()`; there is no implicit storage. The in-memory event bus, channel adapter, and event store moved to `@frontal-labs/open-channel-testing` as `createTestEventBus()`, `createTestChannelAdapter()`, and `createTestEventStore()`. The test channel provider is renamed from `"memory"` to `"test"`.
