# Development deployment review

This reviews running OCP on a developer machine: the Slack quickstart, the TypeScript SDK in
process, and an optional local PostgreSQL event store. It is not a production review. Production
needs a target environment, which this document does not assume.

## What was verified

| Check                                | How                                                                                              | Result                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Full repository check                | `pnpm check`                                                                                     | Passes.                                                                                                                                     |
| Slack quickstart end to end          | `examples/slack-typescript --selftest`: signed webhook in, agent reply out to a fake Slack API   | Passes.                                                                                                                                     |
| Development server behavior          | Started `examples/slack-typescript/main.ts` with placeholder credentials and probed it over HTTP | Unsigned POST returns 401; other paths return 404.                                                                                          |
| Loopback-only binding                | Probed the server on the LAN address                                                             | Refused. The server binds to `127.0.0.1` by default.                                                                                        |
| Graceful shutdown                    | Sent SIGINT to the running server                                                                | Logged the signal, closed the listener, stopped the app, exited.                                                                            |
| Postgres store logic                 | `extensions/postgres/tests/*.test.ts` without a database                                         | Passes (7 tests).                                                                                                                           |
| Postgres store against a live server | `OCP_POSTGRES_URL` with `live.test.ts`, run against PostgreSQL 18.6 in a Docker container        | Passes: 12 of 12 tests, on three consecutive runs. The migration also upgrades a pre-existing action table that has no `claimed_at` column. |

## Configuration

| Variable               | Used by            | Notes                                                                              |
| ---------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `SLACK_BOT_TOKEN`      | Slack example      | Bot token (`xoxb-…`). Required. Keep it in a local `.env` that is not committed.   |
| `SLACK_SIGNING_SECRET` | Slack example      | Verifies every inbound webhook. Required.                                          |
| `SLACK_BOT_USER_ID`    | Slack example      | Optional. Stops the bot answering its own messages.                                |
| `SLACK_API_BASE`       | Slack example      | Optional. Defaults to `https://slack.com/api`. Point it at a fake server in tests. |
| `PORT`                 | Slack example      | Defaults to 3000.                                                                  |
| `HOST`                 | Slack example      | Defaults to `127.0.0.1`. Set it only when a reverse proxy is in front.             |
| `OCP_POSTGRES_URL`     | Postgres live test | Enables `live.test.ts`. Use a disposable local database.                           |

No value is read from a tracked file. The self-test uses placeholder values that never reach Slack.

## Exposure

- The webhook server listens on loopback. Slack cannot reach it directly. Expose it with a
  tunnel such as `cloudflared tunnel --url http://127.0.0.1:3000`, and register the tunnel URL as
  the Slack request URL.
- Every inbound request is verified before it is processed. Requests with an unsigned or forged
  signature are rejected with 401 and never reach the agent. Oversized bodies get 413, and
  malformed signed bodies get 400.
- A tunnel URL is public. Anyone who learns it can send requests, but they fail verification
  without the signing secret. Rotate the signing secret if the URL or secret leaks.

## Data

- The Slack example stores events in memory. Restarting it loses history, and claimed actions are
  forgotten. That is acceptable for a development run.
- The Postgres store needs its migration applied once per database. `migratePostgresEventStore`
  is idempotent. Use `tableName` to keep development data separate from other tables.
- Claimed actions now expire after a lease (five minutes by default, configurable with
  `leaseMs`). A worker that crashes mid-action no longer blocks that action forever. The lease
  also means a slow worker can finish after another worker has taken over. Executors must treat
  the action ID as an idempotency key.

## Operations

- Logs go to the console. There are no structured logs or metrics in the example.
- There is no supervisor. A crash stops the agent, and nothing restarts it.
- SIGINT and SIGTERM close the listener and stop the app before exit, so in-flight conversations
  finish first.

## Gaps for development

1. No live Slack run. The quickstart is verified against a fake Slack API only, so the real
   request and response shapes have not been exercised.
2. Live Postgres ran against a disposable local container only. It has not run against a
   managed database, a restricted-privilege role, or a production-sized table.
3. No automated restart, log shipping, or secrets manager.
4. The in-memory example store and the empty policy mean the example can only reply.

## Before a shared environment

Set up a target environment, then repeat this review against it. Run the live Postgres test
there, add a restart policy, and move secrets into that environment's secret store.
