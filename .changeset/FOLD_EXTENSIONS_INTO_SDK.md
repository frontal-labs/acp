---
"openchannel": minor
---

Fold every channel and capability extension into the `openchannel` SDK as subpath imports: `openchannel/slack`, `openchannel/teams`, `openchannel/google-chat`, `openchannel/email`, `openchannel/whatsapp`, `openchannel/a2a`, `openchannel/calendar`, `openchannel/mcp`, `openchannel/directory`, `openchannel/otel`, `openchannel/opa`, `openchannel/cedar`, and `openchannel/postgres`. The `@openchannel/<provider>` packages are no longer published.

Exports drop the `create` prefix: `createSlackChannel` is now `slackChannel`, `createPostgresEventStore` is now `postgresStore`, and so on. The SDK also re-exports `RuleBasedPolicyEngine`, `createActor`, `ActorType`, `ActorRefSchema`, and `ChannelRefSchema` so applications import from `openchannel` alone. `zod` is an optional peer, required only by `openchannel/calendar` and `openchannel/mcp`.
