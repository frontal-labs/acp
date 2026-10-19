# ACP extensions

Optional integrations for the ACP TypeScript SDK. Every channel extension keeps provider-specific
payloads at the boundary and exposes the SDK-native `ChannelSource`, `ChannelSink`, or
`ChannelDefinition` contracts. Normalized events use the stable v1 `EventEnvelope`; v2 remains an
experimental protocol path and is not required by these packages.

## Channel extensions

| Package | Provider | Main exports |
| --- | --- | --- |
| `@acp/ext-slack` | Slack Events API/Web API | `createSlackChannel`, webhook verification |
| `@acp/ext-microsoft-teams` | Microsoft Teams | `createTeamsChannel`, approval-card normalization |
| `@acp/ext-google-chat` | Google Chat | `createGoogleChatChannel`, token verification |
| `@acp/ext-email` | SMTP/IMAP-compatible hosts | `createEmailChannel`, polling lifecycle |
| `@acp/ext-whatsapp` | WhatsApp Business Cloud | `createWhatsAppChannel`, HMAC/challenge verification |
| `@acp/ext-a2a` | A2A-compatible transports | `createA2AChannel`, agent-card port |

## Runtime extensions

| Package | Purpose |
| --- | --- |
| `@acp/ext-calendar` | Zod-validated, policy-controlled calendar actions |
| `@acp/ext-mcp` | Zod-validated, policy-controlled MCP tool actions |
| `@acp/ext-postgres` | Durable PostgreSQL `EventStore` and migration |
| `@acp/ext-opentelemetry` | Provider-neutral SDK lifecycle hooks and spans/counters |
| `@acp/ext-directory` | Cached directory lookup ports for Google/Microsoft hosts |
| `@acp/ext-policy-opa` | OPA decision adapter for the synchronous policy contract |
| `@acp/ext-policy-cedar` | Cedar evaluator adapter |
| `@acp/ext-shared` | Boundary validation, event construction, signatures, and error classification |

## Example

```ts
import { createAcp } from "acp-sdk";
import { createSlackChannel } from "@acp/ext-slack";
import { RuleBasedPolicyEngine } from "@acp/policy";

const app = createAcp({
  channels: [
    createSlackChannel({
      transport: {
        postMessage: async (input) => ({ messageId: input.idempotencyKey }),
      },
    }),
  ],
  policy: new RuleBasedPolicyEngine({ rules: [] }),
});

await app.start();
await app.receive("slack", slackRequestBody);
```

Provider credentials and official client instances are intentionally injected through small
transport ports. This keeps packages testable, avoids forcing provider SDKs into the dependency
graph, and lets applications choose their own auth, retry, and HTTP runtime.
