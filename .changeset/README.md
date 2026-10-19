# Changesets

Add one Markdown file to this directory for every user-visible package change:

```md
---
"acp-sdk": minor
---

Describe the change and any migration notes.
```

Run `pnpm changeset` to create a changeset interactively, `pnpm changeset:status` to inspect pending releases, and `pnpm release:version` to apply versions and changelogs. Public SDK distributions use the common name `acp-sdk`; their language import identifiers are `acp-sdk`, `acp`, and `acp_sdk` respectively. Release image/container identifiers retain ecosystem suffixes such as `acp-sdk-ts`, `acp-sdk-py`, and `acp-sdk-rs`.

Generated changelog entries use the GitHub-aware Changesets adapter and link back to `frontal-labs/acp`.
