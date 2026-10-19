# ACP project skills

This directory is published as a skills.sh-compatible skill collection. The
root [`skills.sh.json`](../skills.sh.json) file controls the grouping shown on
the skills.sh repository page; each skill remains independently installable.

Install the collection from the GitHub repository with:

```bash
npx skills add frontal-labs/acp
```

These project-local skills give agents focused guidance for changing the ACP
protocol and its reference implementations. Load the narrowest skill that
matches the work:

| Skill | Use it for |
| --- | --- |
| [`acp-protocol`](./acp-protocol/SKILL.md) | Protobuf schemas, event mappings, generated bindings, and wire compatibility |
| [`acp-agent`](./acp-agent/SKILL.md) | Agent definitions, cards, message handling, and SDK behavior |
| [`acp-policy`](./acp-policy/SKILL.md) | Policy decisions, approvals, escalation, and runtime safety semantics |
| [`acp-adapter`](./acp-adapter/SKILL.md) | Provider adapters, channel gateways, inbound normalization, and dispatch |
| [`acp-testing`](./acp-testing/SKILL.md) | Vitest tests, deterministic fixtures, test doubles, and validation |
| [`acp-examples`](./acp-examples/SKILL.md) | Framework bridges, harness integrations, tool boundaries, and example DX |
| [`acp-governance`](./acp-governance/SKILL.md) | Repository docs, security, releases, Renovate, and agent tooling |

The skills are intentionally independent. Use more than one when a change
crosses boundaries, such as adding a protocol event and an SDK feature.
