# ACP extensions

This directory is reserved for provider-specific integrations and optional protocol extensions.

Extensions should translate provider-native events at the adapter boundary and keep the canonical ACP event model in `proto/v1`. Each extension should document its provider, configuration, permissions, and mapping to `ChannelRef` and `EventEnvelope`.
