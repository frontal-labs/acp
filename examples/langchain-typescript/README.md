# LangChain TypeScript + OCP

This example uses the current LangChain `createAgent` API behind the shared OCP
TypeScript bridge. The bridge supplies a real OCP message event and dispatches
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

## OCP mapping

The OCP bridge preserves the agent identity, event correlation, and memory
channel. LangChain owns model execution; OCP remains the boundary for provider
delivery, policy, approvals, and audit events.
