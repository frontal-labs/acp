# Release guide

OCP uses Changesets for JavaScript package versioning and release orchestration. The public release surface is:

- npm: `@frontal-labs/open-channel-cli` and `@frontal-labs/open-channel`;
- crates.io: `open-channel`;
- PyPI: `open-channel`;

The SDK distribution name is `open-channel` on crates.io and PyPI, and
`@frontal-labs/open-channel` on npm (npm requires a scope for this name). The
language-specific import identifiers are `@frontal-labs/open-channel` for
TypeScript, `open_channel` for Python, and `open_channel` for Rust.

Release image/container identifiers retain ecosystem suffixes (`open-channel-ts`,
`open-channel-py`, and `open-channel-rs`) even though the published SDK package names are
unified as `open-channel`.

## Prepare a release

1. Add a changeset with `pnpm changeset` for each user-visible package change.
2. Run `pnpm changeset:status` and review the release plan.
3. Run `pnpm check`.
4. Run `pnpm release:version` to update package versions, changelogs, and the Rust/Python SDK manifests.
5. Review the generated changes, then commit them and create a release PR.

## Publish from CI

The `Release` workflow creates or updates the Changesets release PR. Once that PR
lands on `main`, it publishes the TypeScript CLI/SDK, Rust SDK, and Python SDK.

Configure these repository secrets before enabling publishing:

- `NPM_TOKEN` — npm publish token for `@frontal-labs/open-channel-cli` and `@frontal-labs/open-channel`;
- `CARGO_REGISTRY_TOKEN` — crates.io token for `open-channel`;
- `PYPI_API_TOKEN` — PyPI token for `open-channel`.

Run `pnpm release:publish:sdk -- --dry-run` locally to package and validate the
Rust and Python SDK distributions without uploading them. Never commit registry
tokens.
