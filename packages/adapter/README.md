# @acp/adapter

Provider-neutral channel adapter contracts for ACP.

## API

- `ChannelSource` normalizes provider-native inbound input and can own polling or websocket lifecycle.
- `ChannelSink` defines the outbound `send()` boundary and provider name.
- `ChannelConnector` combines both contracts for providers that support both directions.
- `ChannelAdapter` remains an alias for the outbound sink contract.
- `InMemoryChannelAdapter` captures outbound events for tests and local demos.

Adapters should translate provider-specific identifiers into `ChannelRef` and keep provider SDK details outside ACP core packages.

## Development

```bash
pnpm --filter @acp/adapter build
pnpm --filter @acp/adapter typecheck
```
