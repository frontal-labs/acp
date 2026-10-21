---
name: ocp-agent
description: Build or change OCP agents, agent cards, message handlers, and SDK behavior across the TypeScript, Python, or Rust developer APIs.
---

# OCP agent development

Use this skill when implementing an agent or changing how an agent is
discovered, receives messages, replies, requests actions, or participates in a
conversation. Keep the agent API transport-neutral and A2A-like without
assuming an A2A transport.

## TypeScript reference API

The TypeScript SDK lives in [`sdks/typescript`](../../sdks/typescript). Its
public entrypoint is an explicit exporter in `src/index.ts`; implementation
belongs in separate modules.

Register agents through `AgentHost` and an `AgentDefinition`:

```ts
const host = new AgentHost({ runtime, gateway });

host.register({
  id: "agent:support",
  name: "Support Agent",
  skills: [{ id: "support", name: "Support" }],
  async onMessage(context) {
    await context.reply(`Received: ${context.message.text}`);
  },
});

const detach = host.attach();
```

Use `listAgentCards()` and `getAgentCard()` for discovery. A card describes
identity, version, capabilities, and skills; it is not permission to invoke
arbitrary actions.

## Message and action rules

- Agents handle `message.received` events addressed to their actor ID.
- Use `context.reply()` so replies retain the inbound channel, conversation,
  correlation, and causation context and are dispatched through the gateway.
- Use `context.requestAction()` for side effects. The runtime must evaluate
  policy before an action is authorized or placed into approval.
- Never call a provider SDK directly from an agent implementation. Provider
  delivery belongs in an adapter.
- Do not treat an approval request as execution. An explicit executor must
  perform an approved action and emit its result.
- Use stable `agent:` identifiers and advertise only capabilities the agent
  actually implements.

## Cross-SDK changes

When a behavior is part of the developer-facing contract, check the native
layouts in [`sdks/python`](../../sdks/python) and [`sdks/rust`](../../sdks/rust)
as well as the TypeScript implementation. Generated protobuf types are shared
wire bindings, not a substitute for a coherent SDK API.

## Verification

Test the observable flow: inbound message, agent selection, reply or action
request, policy/approval result, and outbound dispatch. Use deterministic
fixtures from [`@frontal-labs/open-channel-testing`](../ocp-testing/SKILL.md), not real provider
credentials or wall-clock sleeps. Add agent-card discovery tests when the
card shape changes, and test duplicate registration as a conflict.

Relevant commands:

```bash
pnpm --filter @frontal-labs/open-channel test
pnpm --filter @frontal-labs/open-channel typecheck
pnpm test
```
