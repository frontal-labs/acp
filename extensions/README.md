# OCP extensions

Optional integrations for the OCP TypeScript SDK. Every channel extension keeps provider-specific
payloads at the boundary and exposes the SDK-native `ChannelSource`, `ChannelSink`, or
`ChannelDefinition` contracts. Normalized events use the single `EventEnvelope` of protocol 2.0 from `@frontal-labs/open-channel-protocol`.

## Channel extensions

| Package | Provider | Main exports |
| --- | --- | --- |
| `@frontal-labs/open-channel-ext-slack` | Slack Events API/Web API | `createSlackChannel`, webhook verification |
| `@frontal-labs/open-channel-ext-microsoft-teams` | Microsoft Teams | `createTeamsChannel`, approval-card normalization |
| `@frontal-labs/open-channel-ext-google-chat` | Google Chat | `createGoogleChatChannel`, token verification |
| `@frontal-labs/open-channel-ext-email` | SMTP/IMAP-compatible hosts | `createEmailChannel`, polling lifecycle |
| `@frontal-labs/open-channel-ext-whatsapp` | WhatsApp Business Cloud | `createWhatsAppChannel`, HMAC/challenge verification |
| `@frontal-labs/open-channel-ext-a2a` | A2A-compatible transports | `createA2AChannel`, agent-card port |

## Runtime extensions

| Package | Purpose |
| --- | --- |
| `@frontal-labs/open-channel-ext-calendar` | Zod-validated, policy-controlled calendar actions |
| `@frontal-labs/open-channel-ext-mcp` | Zod-validated, policy-controlled MCP tool actions |
| `@frontal-labs/open-channel-ext-postgres` | Durable PostgreSQL `EventStore` and migration |
| `@frontal-labs/open-channel-ext-opentelemetry` | Provider-neutral SDK lifecycle hooks and spans/counters |
| `@frontal-labs/open-channel-ext-directory` | Cached directory lookup ports for Google/Microsoft hosts |
| `@frontal-labs/open-channel-ext-policy-opa` | OPA decision adapter for the synchronous policy contract |
| `@frontal-labs/open-channel-ext-policy-cedar` | Cedar evaluator adapter |
| `@frontal-labs/open-channel-ext-shared` | Boundary validation, event construction, signatures, and error classification |

## Example

```ts
import { openChannel } from "@frontal-labs/open-channel";
import { createSlackChannel } from "@frontal-labs/open-channel-ext-slack";
import { RuleBasedPolicyEngine } from "@frontal-labs/open-channel-policy";

const app = openChannel({
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
