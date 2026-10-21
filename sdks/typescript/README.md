# open-channel

The npm package `@frontal-labs/open-channel` for building OCP agents, hosts, policy-controlled
actions, and channel integrations.

```bash
pnpm add @frontal-labs/open-channel
```

```ts
import { createOcp } from "@frontal-labs/open-channel";

const app = createOcp({
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

`createOcp()` composes the runtime, `AgentHost`, channel source/sink
registration, action registry, lifecycle, and hooks. Use `AgentHost` directly
when an application needs lower-level composition. The package also exposes
the typed event builders through `@frontal-labs/open-channel-protocol`, which take a `protocolVersion` of `"0.1"` (default) or `"0.2"`.

## Development

```bash
pnpm --filter @frontal-labs/open-channel build
pnpm --filter @frontal-labs/open-channel typecheck
pnpm --filter @frontal-labs/open-channel test
```
