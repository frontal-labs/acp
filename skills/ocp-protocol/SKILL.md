---
name: ocp-protocol
description: Change OCP protobuf schemas, event mappings, generated bindings, and wire serialization while preserving protocol compatibility.
---

# OCP protocol engineering

Use this skill when a task changes the OCP wire contract: protobuf messages,
event names, payload cases, ProtoJSON, generated SDK bindings, or protocol
version behavior. Do not use it for an implementation-only change that does
not alter the wire contract.

## Canonical sources

- The single event envelope lives in [`proto/ocp/api`](../../proto/ocp/api).
- Shared domain types live in [`proto/ocp/types`](../../proto/ocp/types).
- Generated output lives in `proto/gen/{typescript,python,rust}`. Never edit it
  by hand.
- Buf configuration lives in [`proto/buf.yaml`](../../proto/buf.yaml) and
  [`proto/buf.gen.yaml`](../../proto/buf.gen.yaml).
- Normative behavior is in [`docs/SPEC.md`](../../docs/SPEC.md).

## Required invariants

1. Keep package names `ocp.api` and `ocp.types`. Do not add a version suffix.
2. Treat existing protobuf field numbers as stable. Add fields instead of
   renumbering or reusing old numbers. Field 2 (`event_type`) is reserved.
3. Every event name must map to exactly one protobuf payload case. The name is
   always derived from the payload; the envelope stores no event type string. Update the
   mapping in the spec, protocol helpers, validation, and tests together.
4. Keep provider-specific identifiers in channel references or extensions;
   core payloads remain provider-neutral.
5. Preserve explicit named exports from package `src/index.ts` files. Do not
   replace them with a barrel wildcard export.
6. Validate untrusted JSON with the exported Zod schemas before converting it
   into a runtime event. Keep Zod validation aligned with the protobuf shape.

## Change workflow

1. Read the relevant section of the spec and inspect neighboring `.proto`
   files before editing.
2. Edit only the canonical schema and hand-written protocol helpers. Keep
   generated files as build output.
3. Update `packages/protocol` event constants, payload mapping, Zod schemas,
   serialization, and explicit exports when the event contract changes.
4. Regenerate all language bindings from the repository root:

   ```bash
   pnpm generate
   ```

5. Update Python and Rust SDK code only where generated types require a
   hand-written API adjustment; keep their public behavior aligned with the
   TypeScript SDK.
6. Add conformance coverage for valid events, invalid event/payload pairs,
   JSON round trips, and any new compatibility rule.
7. Run the narrow checks first, then the full relevant validation:

   ```bash
   pnpm proto:lint
   pnpm proto:build
   pnpm typecheck
   pnpm test
   ```

Do not claim a schema change is complete while generated bindings, protocol
validation, or SDK compilation are stale.
