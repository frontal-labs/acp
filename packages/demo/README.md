# @frontal-labs/open-channel-demo

Runnable OCP approval and action-execution scenario.

The demo sends a message to a support agent, requests a customer-facing action,
approves it through `OpenChannel`, and prints the resulting delivery.

```bash
pnpm demo
```

`src/index.ts` exports `runDemo`; `src/main.ts` is the executable entrypoint used by the Turbo task.
