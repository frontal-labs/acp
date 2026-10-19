# Release guide

ACP uses Changesets for JavaScript package versioning and release orchestration. The public release surface is:

- npm: `acp-cli` and `acp-sdk-ts`;
- crates.io: `acp-sdk-rs` and the native `acp-cli` crate;
- PyPI: `acp-sdk-py`;
- GitHub Releases: native `acp-cli` archives for the supported target triples.

## Prepare a release

1. Add a changeset with `pnpm changeset` for each user-visible package change.
2. Run `pnpm changeset:status` and review the release plan.
3. Run `pnpm check`.
4. Run `pnpm release:version` to update package versions, changelogs, and the native Rust/Python manifests.
5. Review the generated changes, then commit them and create a release PR.

## Publish from CI

The `Release` workflow creates or updates the Changesets release PR. Once that PR
lands on `main`, it publishes the npm, crates.io, and PyPI packages and attaches
the five native CLI archives to `acp-cli-v<version>`.

Configure these repository secrets before enabling publishing:

- `NPM_TOKEN` — npm publish token for `acp-cli` and `acp-sdk-ts`;
- `CARGO_REGISTRY_TOKEN` — crates.io token for `acp-sdk-rs` and `acp-cli`;
- `PYPI_API_TOKEN` — PyPI token for `acp-sdk-py`.

Run `pnpm release:publish:native -- --dry-run` locally to package and validate
the native SDK and CLI distributions without uploading them. Never commit
registry tokens.
