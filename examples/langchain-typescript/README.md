# LangChain TypeScript + ACP

This example uses the current LangChain `createAgent` API behind the shared ACP
TypeScript bridge. The bridge supplies a real ACP message event and dispatches
the final response through `ChannelGateway`.

## Install and run

From the repository root:

```bash
npm install --prefix examples/langchain-typescript
export OPENAI_API_KEY=replace-me
npm start --prefix examples/langchain-typescript
```

Set `OPENAI_MODEL` to override the default `gpt-4o-mini`. The example is
intentionally not a pnpm workspace package so framework dependencies remain
opt-in.

## ACP mapping

The ACP bridge preserves the agent identity, event correlation, and memory
channel. LangChain owns model execution; ACP remains the boundary for provider
delivery, policy, approvals, and audit events.
