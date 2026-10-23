# Release guide

OCP uses Changesets for JavaScript package versioning and release orchestration. The public release surface is:

- npm: `openchannel` (TypeScript SDK, including the `openchannel/<provider>` subpaths), `@openchannel/cli`, and the core `@openchannel/*` packages;
- GitHub Packages (npm registry, scope `@openchannel`): the scoped core TypeScript packages, as a mirror; `openchannel` is published to npm only;
- crates.io: `openchannel`;
- PyPI: `openchannel`.

GitHub Packages only hosts npm packages here. Rust and Python are published to crates.io and PyPI only.

The SDK distribution name is `openchannel` on npm, PyPI, and crates.io. The
import identifier is `openchannel` in TypeScript, Python, and Rust.

Release image/container identifiers retain ecosystem suffixes (`open-channel-ts`,
`open-channel-py`, and `open-channel-rs`) even though the published SDK package names are
unified as `openchannel`.

## One-time setup for the `@openchannel` scope

These steps need account owner access and are not done by the repository:

1. Create the `openchannel` organisation on npm and grant the release team publish rights.
2. Create the `openchannel` organisation on GitHub, or the GitHub Packages registry above will reject
   the `@openchannel` scope, because GitHub Packages only accepts a scope that matches the owning
   organisation.
3. Add an `NPM_TOKEN` secret with publish rights for `@openchannel`.
4. Decide what happens to the old `@frontal-labs/*` packages on npm. Deprecating them points existing
   installs at the new names, for example with `npm deprecate "@frontal-labs/open-channel-*" "Renamed to @openchannel/*"`.
   Run this only after the first `@openchannel` release is published.

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
2. the scoped TypeScript packages to GitHub Packages (`scripts/publish-github-packages.mjs`), skipping any version already there;
3. the Rust crate to crates.io and the Python distributions to PyPI (`scripts/publish-sdk.mjs`).

Configure these repository secrets before enabling publishing:

- `NPM_TOKEN`: npm publish token for the `@openchannel` scope;
- `CARGO_REGISTRY_TOKEN`: crates.io token for `openchannel`;
- `PYPI_API_TOKEN`: PyPI token for `openchannel`.

GitHub Packages uses the workflow's `GITHUB_TOKEN`. The release job requests `packages: write`, so no extra secret is needed.

The `CI` workflow runs a `release-dry-run` job on every pull request. It builds the packages and runs
both dry runs, so packaging problems show up before a release PR is merged.

## Publish order

The `openchannel` SDK depends on the core `@openchannel/*` packages (`adapter`, `core`, `policy`, `protocol`, `runtime`), so they are released together. They share the `fixed` group in `.changeset/config.json`, and `changeset publish` publishes dependencies before dependents. Do not publish `openchannel` alone: its install would fail until the core packages exist on the registry.

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
@openchannel:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Installing requires a GitHub token with `read:packages`.
