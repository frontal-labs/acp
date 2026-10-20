# acp-sdk

The npm package `acp-sdk` for building ACP agents, hosts, policy-controlled
actions, and channel integrations.

```bash
pnpm add acp-sdk
```

```ts
import { createAcp } from "acp-sdk";

const app = createAcp({
  policy,
  agents: [
    {
      id: "agent:support",
      name: "Support Agent",
      onMessage: async (context) => {
        await context.reply(`Received: ${context.message.text}`);
      },
    },
  ],
});

await app.start();
```

`createAcp()` composes the runtime, `AgentHost`, channel source/sink
registration, action registry, lifecycle, and hooks. Use `AgentHost` directly
when an application needs lower-level composition. The package also exposes
the typed event builders through `@acp/protocol`, which take a `protocolVersion` of `"0.1"` (default) or `"0.2"`.

## Development

```bash
pnpm --filter acp-sdk build
pnpm --filter acp-sdk typecheck
pnpm --filter acp-sdk test
```
