# acp-cli

The `acp` command-line tool for inspecting and validating ACP events.

Install the published npm package with:

```bash
pnpm add --global acp-cli
```

## Commands

```bash
acp help
acp version
acp validate event.json
cat event.json | acp validate
```

`validate` accepts ACP ProtoJSON and validates both the protobuf envelope and ACP event/payload invariants.

The command exits with status `0` for a valid event and status `1` for invalid
JSON, an invalid envelope, or an event/payload mismatch.

## Development

```bash
pnpm cli -- version
pnpm --filter acp-cli build
```
