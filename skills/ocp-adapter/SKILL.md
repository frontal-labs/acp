---
name: ocp-adapter
description: Implement provider-neutral OCP channel adapters, gateway routing, inbound normalization, and outbound dispatch behavior.
---

# OCP channel adapters

Use this skill when connecting OCP to Slack, Teams, Google Chat, email,
WhatsApp, or another communication provider. The adapter boundary should make
provider differences explicit while keeping OCP events portable.

## Boundaries

- [`packages/adapter`](../../packages/adapter) owns the small
  `ChannelAdapter` contract and provider implementations.
- [`packages/runtime`](../../packages/runtime) owns `ChannelGateway`, which
  ingests normalized events and dispatches outbound events to a registered
  adapter.
- [`packages/protocol`](../../packages/protocol) owns event validation and
  serialization; it must not depend on provider SDKs.
- Provider identifiers belong in `ChannelRef.provider`, `channelId`,
  `threadId`, or extensions. Do not add Slack/Teams-specific fields to shared
  OCP payloads unless the protocol itself is intentionally extended.

The current adapter contract is outbound-oriented:

```ts
interface ChannelAdapter {
  readonly provider: string;
  send(event: EventEnvelope): Promise<void>;
}
```

Provider webhooks, polling, or queue consumers should normalize inbound data
into a validated `message.received` envelope and pass it to
`ChannelGateway.ingest()`. Outbound events go through `dispatch()` so a
missing provider or adapter fails clearly instead of looking delivered.

## Implementation rules

1. Validate at the provider boundary before handing untrusted data to the
   runtime or an agent.
2. Preserve event identity, correlation, causation, conversation, channel,
   actor, recipient, and thread context when translating messages.
3. Keep delivery failures distinguishable from protocol/validation failures;
   use shared `TransportError` for provider acceptance failures.
4. Make retries safe by preserving the original event/idempotency identity.
5. Do not make adapter delivery imply that an event was durably recorded; the
   runtime event store and provider send are separate concerns.
6. Keep credentials, HTTP clients, and provider SDK types inside the adapter
   package or integration boundary.

## Testing

Use `InMemoryChannelAdapter` for runtime and agent tests. A provider adapter
should have focused tests for inbound normalization, thread/conversation
mapping, outbound payload construction, provider errors, and retry identity.
Do not require live provider credentials in unit tests. Assert that
`ChannelGateway.dispatch()` rejects a missing provider with a shared OCP error
and sends to the adapter selected by `channel.provider`.

