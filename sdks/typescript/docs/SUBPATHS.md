# Provider and capability subpaths

Everything ships in one package. Install `openchannel` and import each provider or capability from its subpath:

```bash
pnpm add openchannel
```

```ts
import { openChannel, ActorType, createActor, RuleBasedPolicyEngine } from "openchannel";
import { slackChannel, verifySlackWebhook } from "openchannel/slack";
import { postgresStore } from "openchannel/postgres";
```

Each subpath keeps provider-specific payloads at its boundary and exposes the SDK-native `ChannelSource`, `ChannelSink`, `ChannelDefinition`, `ActionDefinition`, or policy contracts. Normalized events use the single `EventEnvelope` from `openchannel`.

Provider credentials and official client instances are injected through small transport ports. The SDK does not depend on provider SDKs, so you choose the HTTP client, auth, and retry behavior.

## Channels

| Subpath | Provider | Exports | Guide |
| --- | --- | --- | --- |
| `openchannel/slack` | Slack Events API and Web API | `slackChannel`, `slackSource`, `slackSink`, `verifySlackWebhook`, `normalizeSlackEvent` | [slack.md](SLACK.md) |
| `openchannel/teams` | Microsoft Teams | `teamsChannel`, `teamsSource`, `teamsSink`, `teamsTokenVerifier`, `verifyTeamsWebhook`, `normalizeTeamsEvent` | [teams.md](TEAMS.md) |
| `openchannel/google-chat` | Google Chat | `googleChatChannel`, `googleChatSource`, `googleChatSink`, `googleChatTokenVerifier`, `verifyGoogleChatWebhook`, `normalizeGoogleChatEvent` | [google-chat.md](GOOGLE_CHAT.md) |
| `openchannel/email` | SMTP/IMAP-compatible hosts | `emailChannel`, `emailSource`, `emailSink`, `normalizeEmailMessage` | [email.md](EMAIL.md) |
| `openchannel/whatsapp` | WhatsApp Business Cloud | `whatsappChannel`, `whatsappSource`, `whatsappSink`, `verifyWhatsAppWebhook`, `verifyWhatsAppChallenge`, `normalizeWhatsAppEvent` | [whatsapp.md](WHATSAPP.md) |
| `openchannel/a2a` | A2A-compatible transports | `a2aChannel`, `a2aSource`, `a2aSink`, `normalizeA2AEvent` | [a2a.md](A2A.md) |

## Actions

| Subpath | Purpose | Exports | Guide |
| --- | --- | --- | --- |
| `openchannel/calendar` | Policy-controlled calendar actions | `calendarActions`, `calendarAction` | [calendar.md](CALENDAR.md) |
| `openchannel/mcp` | Policy-controlled MCP tool calls | `mcpActions`, `mcpAction`, `closeMcpClient` | [mcp.md](MCP.md) |

`calendar` and `mcp` validate input with Zod. Zod is an optional peer dependency, so install it only if you use these subpaths:

```bash
pnpm add zod
```

## Stores, policy, directory, telemetry

| Subpath | Purpose | Exports | Guide |
| --- | --- | --- | --- |
| `openchannel/postgres` | Durable `EventStore` (PostgreSQL) | `postgresStore`, `migratePostgresStore`, `PostgresEventStore`, `postgresEventStoreMigration` | [postgres.md](POSTGRES.md) |
| `openchannel/opa` | OPA decision adapter for the policy contract | `opaPolicy`, `OpaPolicyEngine` | [opa.md](OPA.md) |
| `openchannel/cedar` | Cedar evaluator adapter for the policy contract | `cedarPolicy`, `CedarPolicyEngine` | [cedar.md](CEDAR.md) |
| `openchannel/directory` | Cached directory lookups for Google and Microsoft hosts | `googleDirectory`, `microsoftDirectory`, `CachedDirectoryProvider` | [directory.md](DIRECTORY.md) |
| `openchannel/otel` | Lifecycle hooks, spans, and counters | `otelHooks` | [otel.md](OTEL.md) |

## Renames from the earlier packages

The earlier `@openchannel/<name>` packages are replaced by the subpaths above. Exports drop the `create` prefix:

| Before | After |
| --- | --- |
| `createSlackChannel` | `slackChannel` |
| `createTeamsChannel`, `createTeamsTokenVerifier` | `teamsChannel`, `teamsTokenVerifier` |
| `createGoogleChatChannel`, `createGoogleChatTokenVerifier` | `googleChatChannel`, `googleChatTokenVerifier` |
| `createEmailChannel`, `createWhatsAppChannel`, `createA2AChannel` | `emailChannel`, `whatsappChannel`, `a2aChannel` |
| `createCalendarActions`, `createMcpActions` | `calendarActions`, `mcpActions` |
| `createGoogleDirectoryProvider`, `createMicrosoftDirectoryProvider` | `googleDirectory`, `microsoftDirectory` |
| `createOpenTelemetryHooks` | `otelHooks` |
| `createOpaPolicyEngine`, `createCedarPolicyEngine` | `opaPolicy`, `cedarPolicy` |
| `createPostgresEventStore`, `migratePostgresEventStore` | `postgresStore`, `migratePostgresStore` |

Each `*Source` and `*Sink` follows the same pattern: `slackSource`, `slackSink`, and so on. Type names such as `SlackTransport` and `SlackChannelOptions` are unchanged.
