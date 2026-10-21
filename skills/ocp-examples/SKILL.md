---
name: ocp-examples
description: Build and review OCP examples that bridge agent harnesses, model frameworks, tools, and provider adapters while preserving OCP safety and developer experience.
---

# OCP framework examples

Use this skill when adding or changing anything under `examples/`, or when
connecting OCP to LangChain, OpenAI Agents, PydanticAI, CrewAI, LlamaIndex,
the Vercel AI SDK, MCP, or another agent harness.

## Integration boundary

Every example should show this explicit flow:

```text
framework input -> OCP message.received -> harness/model/tool run
  -> OCP message.sent or action/policy/approval events -> framework/provider output
```

OCP owns identity, correlation, event types, policy signals, approval state,
and transport-neutral context. The harness owns prompts, model calls, tools,
memory, handoffs, and framework-native state. Do not make a model callback a
replacement for `OcpRuntime`, `AgentHost`, or provider adapters.

## Example contract

Each example directory must contain:

- `README.md` with purpose, prerequisites, installation, environment
  variables, run commands, expected output, and the OCP mapping;
- a framework-owned dependency manifest (`requirements.txt`, `pyproject.toml`,
  or `package.json`);
- a runnable `main.py` or `main.ts`, unless the example is explicitly a
  configuration-only reference;
- a safe failure path and no committed credentials;
- a deterministic or dry-run option when the harness permits it.

Keep examples out of the root pnpm workspace unless they are promoted to a
maintained package. Their dependencies must not alter the core lockfile.

## Message mapping

1. Convert the incoming OCP `message.received` text and metadata into the
   harness's user-message shape.
2. Preserve `eventId`, `correlationId`, actor, recipient, channel, conversation,
   and causation context in the bridge or run context.
3. Convert only the final harness response into `message.sent`; do not expose
   provider-specific message classes in OCP packages.
4. Map tool calls that can change state to `context.requestAction()` or the
   runtime action path. A harness approval callback is not an OCP approval
   unless it emits the corresponding OCP event.
5. Normalize framework errors into a visible failure result and retain the
   original event identity for retry diagnostics.

## Framework guidance

- LangChain v1: use `create_agent` and pass OCP text as the last user message;
  keep checkpointer/thread identifiers derived from the OCP conversation.
- OpenAI Agents: use `Runner.run` inside the OCP handler and map
  `result.final_output`; preserve interruptions as an OCP approval boundary.
- PydanticAI: use `agent.run` and map `result.output`; keep structured output
  validation inside the framework and protocol validation at the OCP edge.
- CrewAI: create a crew/task per request or use a documented reusable worker;
  map `kickoff`/`akickoff` output and do not hide destructive tools.
- LlamaIndex: map `FunctionAgent.run` output and keep document/tool context in
  the harness, not in shared protocol payloads.
- Vercel AI SDK: map `generateText` or stream completion output to one OCP
  response, and document the streaming limitations of OCP v0.1.
- MCP: treat `callTool` as an external tool boundary. Validate arguments,
  apply policy, and never treat a successful MCP response as authorization.

## DX and verification

Prefer copy-pasteable commands, clear missing-credential errors, `.env.example`
files where needed, and output that shows the OCP event boundary. Use mocked
models or local tools for tests. Run:

```bash
pnpm check:examples
pnpm check:docs
pnpm check:format
```

Run live framework examples only with explicit credentials and only against
safe, non-production tools.
