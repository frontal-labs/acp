# Native TypeScript ACP

This is the smallest complete TypeScript example. It uses the real `AgentHost`,
`AcpRuntime`, `ChannelGateway`, policy engine, and in-memory channel adapter.

## Run

From the repository root:

```bash
pnpm examples:typescript
pnpm exec tsx examples/native-typescript/approval-flow.ts
```

No model, provider, or credential is required. The first command routes an ACP
`message.received` event to a deterministic agent and dispatches a
`message.sent` event. The second command demonstrates policy, approval, and
explicit approval decision without executing a side effect.

## DX notes

The framework bridge should receive plain text plus ACP context. ACP remains
responsible for identity, correlation, policy, approval, and channel delivery;
the model or harness should not decide whether an action is authorized.
