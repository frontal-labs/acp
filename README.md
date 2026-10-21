# OpenChannel Protocol (OCP)

![Frontal Banner](./banner.jpg)

**Protocol for safe agent communication and approvals.**

OCP is an open communication layer for agents operating inside the channels where people already work: chat, email, calendars, and shared projects.

It standardizes the interaction contract around messages, tasks, approvals, escalation, handoff, policy, and audit events. The core protocol is provider-neutral; Slack, Teams, Google Chat, email, and other providers can implement adapters without changing the event model.

## Status

OCP 1.0.0 is the first stable release of the OpenChannel Protocol and its SDKs. It includes
versioned protobuf schemas, typed event builders, config-first TypeScript/Python/
Rust application facades, policy-controlled actions, source/sink channel
contracts, durable PostgreSQL event storage, and at-least-once processing.

The repository check (`pnpm check`) covers configuration, documentation links,
protobuf lint and generation, lint, build, typecheck, unit and integration tests,
and the Python and Rust SDK test suites.

Two protocol envelopes are supported through one API:

- **Protocol 0.1** (default) is the canonical wire contract. It is specified in
  [`docs/SPEC_V0_1.md`](./docs/SPEC_V0_1.md), and its protobuf field numbers are stable.
- **Protocol 0.2** carries the same event semantics in an envelope whose payload
  `oneof` is the event discriminant. It is not wire-compatible with 0.1
  envelopes, so choose one version per boundary and keep it when serializing,
  validating, or replaying events.

Before running OCP in a shared or production environment, complete the checklist in
[`docs/SECURITY_REVIEW.md`](./docs/SECURITY_REVIEW.md#before-production) and
[`docs/DEPLOYMENT_REVIEW.md`](./docs/DEPLOYMENT_REVIEW.md#before-a-shared-environment).
Those reviews record what has been verified and what still needs a live
environment, such as provider endpoints and a managed PostgreSQL instance.

Project links: [repository](https://github.com/frontal-labs/open-channel), [issues](https://github.com/frontal-labs/open-channel/issues), [security policy](./SECURITY.md), and [release notes](./CHANGELOG.md).

## Quickstart

Requirements: Node.js 22.18+, pnpm 10+ (the repository pins 10.28.0 in `packageManager`), Buf, `protoc`, Python 3.11+, Rust stable, and a working git checkout.

```bash
pnpm install
pnpm generate
pnpm check
pnpm demo
pnpm cli -- version
```

The repository is orchestrated with Turborepo. `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm lint` run through the package graph. Biome is the formatter/linter for TypeScript, Ultracite supplies its shared ruleset, Ruff formats and lints Python, and rustfmt/Clippy format and lint Rust.

Run `pnpm check:examples` to validate the opt-in framework integrations under
`examples/`. The native TypeScript, Python, and Rust examples run without model
credentials; framework examples document their own optional dependencies.

The demo runs this flow:

```text
message.received
  -> policy.allowed
  -> approval.requested
  -> approval.granted
  -> action.executed
```

## Repository layout

```text
proto/v1/api/                  Protocol 0.1 envelope and event definitions (canonical)
proto/v2/api/                  Protocol 0.2 envelope with a payload-oneof discriminator
proto/v1/types/                Shared domain protobuf definitions
proto/gen/                     Generated TypeScript, Python, and Rust bindings
packages/protocol/             Generated types, builders, and serialization helpers
packages/runtime/              Event routing and approval lifecycle
packages/policy/               Rule-based policy engine
packages/adapter/              Provider-neutral adapter contract
packages/core/                 Shared event bus, errors, and identifier primitives
packages/testing/              Fixtures and helpers for TypeScript tests
packages/demo/                 Runnable end-to-end example
extensions/                    Channel, runtime, and policy extensions (see extensions/README.md)
cli/                           `ocp` validation and inspection CLI
sdks/typescript/               TypeScript app facade, agent host, and developer API
sdks/python/                   Python app facade, agent host, and developer API
sdks/rust/                     Rust app builder, agent host, and developer API
examples/                      Native SDK and optional agent-harness integrations
skills/                        OCP-specific instructions for agents and contributors
tests/                         Cross-package Vitest conformance tests
docs/SPEC_V0_1.md              Normative protocol behavior and compatibility rules
docs/DEVELOPMENT.md            Local development and agent SDK guide
docs/SECURITY_REVIEW.md        Code-level security review, open items, and production checklist
docs/DEPLOYMENT_REVIEW.md      Development deployment review and shared-environment checklist
proto/README.md                Schema and generated-code workflow
turbo.json                     Root Turborepo task graph
renovate.json                  Dependency-update policy for code and examples
biome.json                     Canonical Biome entrypoint and Ultracite presets
ultracite.json                 Shared Biome formatting and lint configuration
```

## Protocol model

Every OCP event is an `EventEnvelope` with:

- stable event identity and protocol version;
- source, actor, recipient, channel, and conversation references;
- correlation, causation, and idempotency identifiers;
- a typed protobuf `oneof` payload;
- ProtoJSON support for logs, fixtures, and HTTP-oriented integrations.

In v1, the event type must agree with its payload case. In v2, the payload
oneof is canonical and the friendly event name is derived from it. For example,
`message.received` contains a `messageReceived` payload, while `approval.granted`
and `approval.denied` use `approvalDecided` with different outcomes.

Both versions share one API. Pass `protocolVersion: "0.2"` to `createEvent` or any typed builder to get the envelope where the payload oneof is the canonical event kind; `eventTypeOf()` derives the friendly event name for either version. The default is `"0.1"`.

## Safety semantics

- Policy is evaluated before an action is authorized.
- A denied action cannot proceed.
- An approval-required action creates an approval request rather than executing.
- Expired approvals emit both `approval.expired` and `escalation.triggered`.
- Registered high-level actions execute automatically after an approval grant;
  lower-level runtimes remain available for external executors.
- Event IDs make processing idempotent for replayed inbound events.
- The runtime exposes an append-only event store interface for durable implementations.
- `ChannelGateway.ingest()` handles inbound events and `ChannelGateway.dispatch()` sends outbound events through a registered provider adapter.
- `OcpRuntime.decideApproval()` creates and processes a validated approval outcome without requiring callers to handcraft protobuf envelopes.

## A2A relationship

OCP uses compatible concepts such as actors, tasks, artifacts, correlation IDs, and typed events, but does not require A2A. OCP adds the enterprise-channel concerns that are specific to human and agent communication: recipients, shared channels, approval routing, escalation, handoff, and auditability.

## Contributing

The canonical schema lives under `proto/`. Run `pnpm generate` after changing it, then run `pnpm check`. New provider integrations should implement `ChannelSource` and/or `ChannelSink` and translate provider-native events into OCP envelopes without leaking provider-specific fields into the core payloads. Application code should prefer `createOcp()` from `open-channel`.

Use `pnpm fix` for safe formatting and lint fixes. Package-level task configuration is inherited from the root `turbo.json`; each package also contains a local `turbo.json` so ownership and future task overrides stay close to the package.
