---
"@acp/core": minor
"@acp/adapter": minor
"@acp/runtime": minor
"@acp/testing": minor
"acp-sdk": minor
---

Remove in-memory implementations from production packages. `eventStore` is now required for `AcpRuntime` and `createAcp()`; there is no implicit storage. The in-memory event bus, channel adapter, and event store moved to `@acp/testing` as `createTestEventBus()`, `createTestChannelAdapter()`, and `createTestEventStore()`. The test channel provider is renamed from `"memory"` to `"test"`.
