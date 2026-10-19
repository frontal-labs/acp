# `@acp/testing`

Shared ACP testing fixtures and helpers for TypeScript packages.

The package provides deterministic actors, channels, conversations, actions, every v0.1 event variant, event inspection helpers, deferred promises, polling, recorders, and buffered CLI I/O. It is intended for tests and local reference implementations, not production runtime code.

```ts
import { createTestEvent, eventTypes, requireEvent } from "@acp/testing";

const event = createTestEvent({ eventType: "message.received", text: "hello" });
const events = [event];

requireEvent(events, "message.received");
console.log(eventTypes(events));
```

The package depends only on ACP's foundational core and protocol packages. Higher-level packages use it as a development test dependency so the workspace graph remains acyclic.
