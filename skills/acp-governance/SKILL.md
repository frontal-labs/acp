---
name: acp-governance
description: Maintain ACP repository governance, contribution, security, release, dependency-update, and agent-tooling documentation.
---

# ACP governance and repository tooling

Use this skill for `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`,
`CODE_OF_CONDUCT.md`, `CHANGELOG.md`, Renovate, Changesets, Husky, CI, and
repository-local agent configuration.

## Source of truth

- `AGENTS.md` defines working boundaries and verification.
- `CONTRIBUTING.md` defines the contributor path and review expectations.
- `SECURITY.md` defines private vulnerability reporting and threat boundaries.
- `CODE_OF_CONDUCT.md` defines participation and enforcement expectations.
- `.changeset/config.json` and `CHANGELOG.md` define release-note behavior.
- `renovate.json` defines automated dependency-update policy.
- `skills/` defines focused ACP implementation guidance.

Keep these documents mutually consistent. Links must point to files that exist,
contact addresses must be intentional, and commands must match `package.json`.

## Safety requirements

- Never document public disclosure steps that bypass the private security
  address.
- Never ask contributors to paste credentials, production payloads, or private
  customer data into issues or examples.
- Document that policy precedes authorization and approval precedes execution.
- Keep dependency automation reviewable; do not silently enable automerge for
  runtime, protocol, security, or workflow changes.
- Keep generated files and release artifacts out of hand-maintained docs unless
  the generation command is documented.

## Documentation changes

When adding a repository convention:

1. Put the rule in the narrowest authoritative document.
2. Link to it from `AGENTS.md` or `CONTRIBUTING.md` when it affects work.
3. Add a deterministic checker when drift would create a broken release or
   unsafe workflow.
4. Run `pnpm check:docs` and `pnpm check:config`.

For public developer-experience changes, update the relevant README and add a
top-level Unreleased entry when the change is not package-versioned.

## Release tooling

Changesets should use the GitHub-aware changelog adapter with the canonical
repository slug. Private packages may be versioned without being published;
do not change `privatePackages` behavior without a release decision. Renovate
should cover pnpm, Cargo, Python, GitHub Actions, and opt-in example manifests.

## Review checklist

- Markdown links resolve locally.
- JSON/YAML/TOML remains parseable.
- Every new command exists and is safe to run from a clean checkout.
- New skills are listed in `skills/README.md` and `skills.sh.json`.
- Security-sensitive claims are explicit and do not overpromise support.
