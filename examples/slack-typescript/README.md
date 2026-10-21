# Slack OCP agent

A real-channel quickstart: an OCP agent that answers messages in a Slack
channel. Inbound Slack events are verified and normalized into OCP
`message.received` events; the agent's reply goes out as a `message.sent`
event through Slack's Web API.

## Run it without Slack (no credentials)

```bash
pnpm exec tsx examples/slack-typescript/main.ts --selftest
```

The self-test starts a local fake Slack API and a webhook server, sends a
correctly signed Slack event, checks that the agent replies in the same
channel, and checks that a forged signature is rejected with HTTP 401.

## Run it against a real Slack workspace

1. **Create a Slack app** at <https://api.slack.com/apps>. Under **OAuth &
   Permissions**, add the bot scope `chat:write` and install the app to the
   workspace. Copy the **Bot User OAuth Token** (`xoxb-…`).
2. **Enable events.** Under **Event Subscriptions**, turn events on, subscribe
   the bot to `message.channels` (and `message.groups` for private channels),
   and set the **Request URL** to `https://<your-host>/slack/events`. Slack
   sends a signed `url_verification` request; the server answers it
   automatically.
3. **Invite the bot** to a channel (`/invite @your-bot`).
4. **Expose the server.** For local development, use a tunnel such as
   `cloudflared tunnel --url http://localhost:3000` and use its URL as the
   Request URL.
5. **Set the environment and start the agent:**

```bash
export SLACK_BOT_TOKEN=xoxb-...          # Bot User OAuth Token
export SLACK_SIGNING_SECRET=...          # Basic Information → Signing Secret
export SLACK_BOT_USER_ID=U...            # optional: prevents the bot answering itself
export PORT=3000                         # optional, default 3000
pnpm exec tsx examples/slack-typescript/main.ts
```

Post a message in the channel. The agent replies with `Received: <your text>`.

## What happens on each message

```text
Slack event (signed)
  → verifySlackWebhook()            reject unsigned or replayed requests (401)
  → 200 acknowledged                Slack retries unacknowledged events
  → app.receive("slack", payload)   normalize to message.received, dedupe by event_id
  → AgentHost routes to the agent   by recipient (set in createSlackChannel)
  → agent handler replies           ctx.reply(...)
  → message.sent through the sink   Slack chat.postMessage, threaded when Slack sent a thread
```

The agent never calls Slack directly. Outbound delivery is the channel's job,
and any action the agent needs beyond replying would go through
`ctx.request(...)`, which applies policy and approvals first.

## Production notes

- **Store.** `main.ts` uses the in-memory example store from
  `examples/_shared/typescript/example-kit.ts`. It loses state on restart. Use
  `@frontal-labs/open-channel-ext-postgres` in production.
- **Policy.** The policy is empty, so the agent can only reply. Add rules before
  granting it any action.
- **Retries.** Slack retries unacknowledged deliveries. Events are deduplicated
  by `event_id`, so a retry does not produce a second reply.
- **Secrets.** Keep `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` in your secret
  store. Do not commit them.
