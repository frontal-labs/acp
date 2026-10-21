# Release guide

OCP uses Changesets for JavaScript package versioning and release orchestration. The public release surface is:

- npm: `openchannel` (TypeScript SDK), `@frontal-labs/open-channel-cli`, and the `@frontal-labs/open-channel-*` packages;
- GitHub Packages (npm registry, scope `@frontal-labs`): the same TypeScript packages, as a mirror;
- crates.io: `openchannel`;
- PyPI: `openchannel`.

GitHub Packages only hosts npm packages here. Rust and Python are published to crates.io and PyPI only.

The SDK distribution name is `openchannel` on npm, PyPI, and crates.io. The
import identifier is `openchannel` in TypeScript, Python, and Rust.

Release image/container identifiers retain ecosystem suffixes (`open-channel-ts`,
`open-channel-py`, and `open-channel-rs`) even though the published SDK package names are
unified as `openchannel`.

## Prepare a release

1. Add a changeset with `pnpm changeset` for each user-visible package change.
2. Run `pnpm changeset:status` and review the release plan.
3. Run `pnpm check`.
4. Run `pnpm release:version` to update package versions, changelogs, and the Rust/Python SDK manifests.
5. Review the generated changes, then commit them and create a release PR.

## Publish from CI

The `Release` workflow runs on pushes to `main`. When changesets are pending it opens or updates the
release PR. When that PR lands, it publishes:

1. the TypeScript packages to npm (`changeset publish`);
2. the same TypeScript packages to GitHub Packages (`scripts/publish-github-packages.mjs`), skipping any version already there;
3. the Rust crate to crates.io and the Python distributions to PyPI (`scripts/publish-sdk.mjs`).

Configure these repository secrets before enabling publishing:

- `NPM_TOKEN`: npm publish token for the `@frontal-labs` scope;
- `CARGO_REGISTRY_TOKEN`: crates.io token for `openchannel`;
- `PYPI_API_TOKEN`: PyPI token for `openchannel`.

GitHub Packages uses the workflow's `GITHUB_TOKEN`. The release job requests `packages: write`, so no extra secret is needed.

The `CI` workflow runs a `release-dry-run` job on every pull request. It builds the packages and runs
both dry runs, so packaging problems show up before a release PR is merged.

## Dry runs

```bash
pnpm generate && pnpm build
node scripts/publish-github-packages.mjs --dry-run   # packs every TypeScript package
pnpm release:publish:sdk -- --dry-run                # builds the crate and Python distributions
```

Never commit registry tokens. Registry versions cannot be republished after upload, so a release
must be checked with the dry runs first.

## Installing from GitHub Packages

```ini
@frontal-labs:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Installing requires a GitHub token with `read:packages`.
