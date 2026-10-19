# Changelog

All notable ACP changes are recorded here by Changesets. Pending release notes live in [`.changeset/`](./.changeset/); run `pnpm changeset:version` to apply them to package changelogs.

## Unreleased

- Initial ACP v0.1 reference implementation and repository tooling baseline.
- Documentation now uses uppercase `SNAKE_CASE.md` filenames, validates Markdown
  links and filenames in CI, and documents the current `acp-sdk` distribution
  and language import identifiers.

## Release conventions

User-visible package and protocol changes should have a Markdown file in
[`.changeset/`](./.changeset/). Versioning uses the GitHub-aware Changesets
adapter configured for [`frontal-labs/acp`](https://github.com/frontal-labs).

The repository also keeps this top-level history for project-wide governance,
SDK, example, and tooling changes that are not published as an npm package.
