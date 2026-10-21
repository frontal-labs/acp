# Native TypeScript OCP

This is the smallest complete TypeScript example. It uses the config-first
`openChannel()` API with a policy engine, an example channel, and an example event
store. The store and channel live in `examples/_shared/typescript/example-kit.ts`;
they are for demonstration only, not production.

## Run

From the repository root:

```bash
pnpm examples:typescript
pnpm exec tsx examples/native-typescript/approval-flow.ts
```

No model, provider, or credential is required. The first command routes an OCP
`message.received` event to a deterministic agent and dispatches a
`message.sent` event. The second command demonstrates policy, approval, and an
explicit approval decision through the same app facade.

## DX notes

The framework bridge should receive plain text plus OCP context. OCP remains
responsible for identity, correlation, policy, approval, and channel delivery;
the model or harness should not decide whether an action is authorized.
