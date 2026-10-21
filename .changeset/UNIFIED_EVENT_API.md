---
"@acp/protocol": minor
"acp-sdk": minor
"@acp/ext-postgres": patch
"acp-cli": patch
---

Unify ACP v0.1 and v0.2 event handling behind one API. `createEvent`, the typed builders (`messageReceived`, `messageSent`, `approvalRequested`, `actionExecuted`, `actionFailed`), and the serialization helpers accept a `protocolVersion` of `"0.1"` (default) or `"0.2"`. `eventTypeOf()` derives the event name for either version. The separate `createV2Event`, `v2EventType`, and `v2Event*` helpers are removed.

Application handlers registered with `app.on()` are now isolated: a handler that throws is reported through `hooks.onError` instead of interrupting other handlers. `app.stop()` keeps the host attached while draining so in-flight conversations still deliver their replies. The PostgreSQL event store rejects v0.2 envelopes because the runtime persists v0.1 events.

Binary encoding is real protobuf for every event kind in both versions. A shared parity fixture (`packages/protocol/tests/fixtures/event-parity.json`) is decoded and re-encoded byte-identically by the TypeScript, Python, and Rust SDKs.
