# OCP protobuf schema

The canonical wire schema is split by responsibility and version:

```text
proto/
  buf.yaml       Buf module, lint, and breaking-change configuration
  buf.gen.yaml   Buf code-generation template
  v1/
    api/       Legacy envelopes and protocol-level event definitions
    types/     Shared domain types used by API messages
  v2/
    api/       Versioned typed envelope; its payload oneof is the event discriminant
  gen/
    typescript/
    python/
    rust/
```

Keep package names versioned (`ocp.v1.api`, `ocp.v1.types`, and `ocp.v2.api`) while keeping the repository layout easy to navigate. The `PACKAGE_DIRECTORY_MATCH` and `PACKAGE_VERSION_SUFFIX` Buf rules are intentionally disabled because the requested layout uses versioned directories without repeating the full package name.

Run `pnpm generate` from the repository root after changing a schema. The root scripts pass `proto/buf.yaml` and `proto/buf.gen.yaml` explicitly, so Buf configuration stays next to the schema while generated output remains under `proto/gen`. It runs:

- Buf and `protoc-gen-es` for `proto/gen/typescript`;
- `protoc` 33.2 for `proto/gen/python` (the version CI pins; `pnpm generate:python` refuses other versions, and `PROTOC` can point at the 33.2 binary);
- the Rust SDK's `prost-build` for `proto/gen/rust`.

Generated bindings are checked into this reference repository so each SDK has a visible, reproducible wire surface. Do not edit generated files by hand.
