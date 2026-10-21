# OCP documentation

- [`DEVELOPMENT.md`](./DEVELOPMENT.md) — local setup, workspace commands, SDK development, and verification.
- [`SPEC_V0_1.md`](./SPEC_V0_1.md) — normative OCP v0.1 behavior and compatibility rules.

When a protocol change affects the wire contract, update the protobuf sources
under `proto/`, regenerate bindings with `pnpm generate`, and update
`SPEC_V0_1.md` and conformance tests together.
