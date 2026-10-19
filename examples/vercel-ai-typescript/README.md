# Vercel AI SDK + ACP

This example maps AI SDK Core's `generateText` response into the shared ACP
TypeScript bridge. It demonstrates a request/response path; ACP v0.1 does not
yet standardize token streaming, so streaming requires an application-specific
extension and explicit event mapping.

## Install and run

```bash
npm install --prefix examples/vercel-ai-typescript
export OPENAI_API_KEY=replace-me
npm start --prefix examples/vercel-ai-typescript
```

Set `OPENAI_MODEL` to select another OpenAI model. Keep tool execution behind
ACP policy and approval events.
