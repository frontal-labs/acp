# Changesets

Add one Markdown file to this directory for every user-visible package change:

```md
---
"acp-sdk-ts": minor
---

Describe the change and any migration notes.
```

Run `pnpm changeset` to create a changeset interactively, `pnpm changeset:status` to inspect pending releases, and `pnpm release:version` to apply versions and changelogs. Public JavaScript packages are published by the release workflow; the same release version is synchronized to `acp-sdk-py`, `acp-sdk-rs`, and the native `acp-cli` crate.

Generated changelog entries use the GitHub-aware Changesets adapter and link back to `frontal-labs/acp`.
