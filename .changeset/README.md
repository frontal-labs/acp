# Changesets

Add one Markdown file to this directory for every user-visible package change:

```md
---
"@frontal-labs/open-channel": minor
---

Describe the change and any migration notes.
```

Run `pnpm changeset` to create a changeset interactively, `pnpm changeset:status` to inspect pending releases, and `pnpm release:version` to apply versions and changelogs. Public SDK distributions use the common name `open-channel` (npm: `@frontal-labs/open-channel`); their language import identifiers are `@frontal-labs/open-channel`, `open_channel`, and `open_channel` respectively. Release image/container identifiers retain ecosystem suffixes such as `open-channel-ts`, `open-channel-py`, and `open-channel-rs`.

Generated changelog entries use the GitHub-aware Changesets adapter and link back to `frontal-labs/open-channel`.
