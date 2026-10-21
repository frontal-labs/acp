# openchannel

The npm package `openchannel` for building OCP agents, hosts, policy-controlled
actions, and channel integrations.

```bash
pnpm add openchannel
```

```ts
import { openChannel } from "openchannel";

const app = openChannel({
  policy,
  agents: [
    {
      id: "agent:support",
      name: "Support Agent",
      onMessage: async (context) => {
        await ctx.reply(`Received: ${ctx.message.text}`);
      },
    },
  ],
});

await app.start();
```

`openChannel()` composes the runtime, `AgentHost`, channel source/sink
registration, action registry, lifecycle, and hooks. Use `AgentHost` directly
when an application needs lower-level composition. The package also exposes
the typed event builders through `@frontal-labs/open-channel-protocol`. There is one envelope, version `2.0`.

## Development

```bash
pnpm --filter openchannel build
pnpm --filter openchannel typecheck
pnpm --filter openchannel test
```

## Recovery, audit, and logging

- **Restart recovery.** `start()` rebuilds approval state from the event store. Unresolved approvals are tracked again, a deadline that passed while the process was down expires immediately, and a granted approval whose action never finished runs once. Restart with the same store and the same registered actions.
- **Audit.** `app.store` is the durable event store. Query it directly, for example `app.store.query({ eventType: "approval.granted" })`.
- **Logging.** Agents receive `ctx.logger`. It defaults to `consoleLogger`, which sends warnings and errors to the console. Pass `logger` to `openChannel()` to replace it.
