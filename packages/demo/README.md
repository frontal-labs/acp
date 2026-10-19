# @acp/demo

Runnable ACP approval and escalation scenario.

The demo sends a message to a support agent, submits a customer-facing action, waits for the approval deadline, and prints the resulting audit trail.

```bash
pnpm demo
```

`src/index.ts` exports `runDemo`; `src/main.ts` is the executable entrypoint used by the Turbo task.
