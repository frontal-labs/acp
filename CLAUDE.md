# ACP repository guidance

Follow [`AGENTS.md`](./AGENTS.md) for architecture, generated-file boundaries, and verification. Prefer the smallest change that preserves the provider-neutral ACP event model.

Before handing off a change, run:

```bash
pnpm check:config
pnpm check:docs
pnpm check
```

Use `pnpm changeset` for user-visible package changes. Keep credentials and machine-specific settings out of tracked files; use the ignored `*.local.json` settings files or environment variables.
