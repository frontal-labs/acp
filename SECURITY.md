# Security policy

## Supported versions

ACP is experimental while it is in the `0.x` release line. Security fixes are applied to the latest published commit and release only.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Email `security@frontal.dev` with:

- a concise description and impact;
- affected versions or commits;
- reproduction steps or a proof of concept;
- any suggested mitigation.

Please allow time for triage before public disclosure. Do not include live credentials or other secrets in the report.

## Security expectations

- Keep provider credentials in environment variables or ignored local settings.
- Treat incoming event JSON and provider payloads as untrusted input.
- Run `pnpm check` before publishing generated bindings or release artifacts.

## Scope and threat model

ACP is experimental and security concerns include the protocol, runtime,
policy engine, SDKs, provider adapters, generated bindings, examples,
CI/release workflows, and repository tooling.

The main boundaries are:

- incoming event JSON and provider payloads are untrusted;
- policy evaluation happens before an action is authorized;
- approval requests are not executions;
- credentials must never be included in events, logs, fixtures, or commits;
- generated code must come from reviewed canonical schemas.

## Disclosure process

Maintainers will acknowledge a private report, assess severity and affected
scope, coordinate a fix, and publish a disclosure or release note when
appropriate. Redact secrets and provide a safe reproduction; do not include
live credentials, private customer data, or production payloads.

When reporting dependency or GitHub Actions vulnerabilities, use the private
security channel if project infrastructure could be exposed.
