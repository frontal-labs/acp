# Release guide

ACP uses Changesets for JavaScript package versioning and release orchestration. The public release surface is:

- npm: `acp-cli` and `acp-sdk`;
- crates.io: `acp-sdk`;
- PyPI: `acp-sdk`;

The SDK package name is unified as `acp-sdk`; the language-specific import
identifiers are `acp-sdk` for TypeScript, `acp` for Python, and `acp_sdk` for
Rust.

Release image/container identifiers retain ecosystem suffixes (`acp-sdk-ts`,
`acp-sdk-py`, and `acp-sdk-rs`) even though the published SDK package names are
unified as `acp-sdk`.

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

- `NPM_TOKEN` — npm publish token for `acp-cli` and `acp-sdk`;
- `CARGO_REGISTRY_TOKEN` — crates.io token for `acp-sdk`;
- `PYPI_API_TOKEN` — PyPI token for `acp-sdk`.

Run `pnpm release:publish:sdk -- --dry-run` locally to package and validate the
Rust and Python SDK distributions without uploading them. Never commit registry
tokens.
