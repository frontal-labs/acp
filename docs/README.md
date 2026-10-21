# OCP documentation

- [`DEVELOPMENT.md`](./DEVELOPMENT.md) — local setup, workspace commands, SDK development, and verification.
- [`SPEC.md`](./SPEC.md) — normative OCP 0.2 behavior and compatibility rules.

When a protocol change affects the wire contract, update the protobuf sources
under `proto/`, regenerate bindings with `pnpm generate`, and update
`SPEC.md` and conformance tests together.
