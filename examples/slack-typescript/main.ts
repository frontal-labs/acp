import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { create } from "@bufbuild/protobuf";
import { createOcp } from "@frontal-labs/open-channel";
import {
  createSlackChannel,
  type SlackTransport,
  verifySlackWebhook,
} from "@frontal-labs/open-channel-ext-slack";
import { RuleBasedPolicyEngine } from "@frontal-labs/open-channel-policy";
import { ActorRefSchema, ActorType } from "@frontal-labs/open-channel-protocol";

import { createExampleEventStore } from "../_shared/typescript/example-kit.js";

const SELFTEST = process.argv.includes("--selftest");

/** Slack Web API client for `chat.postMessage`, the only outbound call this agent makes. */
export function createSlackWebApiTransport(token: string, apiBase: string): SlackTransport {
  return {
    postMessage: async ({ channelId, signal, text, threadId }) => {
      const response = await fetch(`${apiBase}/chat.postMessage`, {
        body: JSON.stringify({ channel: channelId, text, thread_ts: threadId }),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=utf-8",
        },
        method: "POST",
        signal,
      });
      const body = (await response.json()) as { error?: string; ok: boolean; ts?: string };
      if (!body.ok) {
        throw new Error(`Slack chat.postMessage failed: ${body.error ?? response.status}`);
      }
      return { messageId: body.ts };
    },
  };
}

/** The OCP app: a Slack channel, one helper agent, and a policy that starts with no actions. */
export function createSlackApp(options: { botUserId?: string; transport: SlackTransport }) {
  const helper = create(ActorRefSchema, { id: "agent:slack-helper", type: ActorType.AGENT });
  return createOcp({
    agents: [
      {
        description: "Replies to Slack messages sent to the workspace",
        id: "agent:slack-helper",
        name: "Slack Helper",
        onMessage: async (context) => {
          await context.reply(`Received: ${context.message.text}`);
        },
        skills: [{ id: "respond", name: "Respond in Slack" }],
      },
    ],
    channels: [
      createSlackChannel({
        botUserId: options.botUserId,
        recipient: helper,
        transport: options.transport,
      }),
    ],
    // Example only. Production deployments use a durable store such as @frontal-labs/open-channel-ext-postgres.
    eventStore: createExampleEventStore(),
    policy: new RuleBasedPolicyEngine({ rules: [] }),
  });
}

/** Slack event payloads are small; anything larger is rejected before it is buffered. */
const MAX_BODY_BYTES = 1024 * 1024;

class BodyTooLargeError extends Error {}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new BodyTooLargeError("request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function respond(response: ServerResponse, status: number, body?: unknown): void {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (status === 413) {
    // Close after rejecting an oversized body so the client does not keep uploading.
    headers.connection = "close";
  }
  response.writeHead(status, headers);
  response.end(body === undefined ? "" : JSON.stringify(body));
}

/** Serves Slack Events API requests: verify the signature, acknowledge, then hand off to OCP. */
export function createWebhookServer(options: {
  app: ReturnType<typeof createSlackApp>;
  signingSecret: string;
}) {
  return createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/slack/events") {
      respond(response, 404);
      return;
    }
    let raw: Buffer;
    try {
      raw = await readBody(request);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        respond(response, 413, { error: "request body too large" });
      } else {
        respond(response, 400, { error: "unreadable request body" });
      }
      return;
    }
    try {
      verifySlackWebhook(
        {
          body: raw,
          headers: {
            "x-slack-request-timestamp": request.headers["x-slack-request-timestamp"] as
              | string
              | undefined,
            "x-slack-signature": request.headers["x-slack-signature"] as string | undefined,
          },
        },
        options.signingSecret,
      );
    } catch {
      respond(response, 401, { error: "invalid Slack signature" });
      return;
    }
    let payload: { challenge?: string; event_id?: string; type: string };
    try {
      payload = JSON.parse(raw.toString("utf8")) as typeof payload;
    } catch {
      respond(response, 400, { error: "malformed Slack event" });
      return;
    }
    if (payload.type === "url_verification") {
      respond(response, 200, { challenge: payload.challenge });
      return;
    }
    // Slack retries unacknowledged deliveries, so acknowledge first and process after.
    respond(response, 200);
    options.app.receive("slack", payload, { eventId: payload.event_id }).catch((error: unknown) => {
      console.error("OCP could not process the Slack event:", error);
    });
  });
}

function listen(server: ReturnType<typeof createServer>, port: number): Promise<number> {
  return new Promise((resolve) => {
    server.listen(port, () => resolve((server.address() as AddressInfo).port));
  });
}

function sign(secret: string, timestamp: string, body: string): string {
  const digest = createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex");
  return `v0=${digest}`;
}

/** Deterministic end-to-end check against a local fake Slack API. No credentials needed. */
async function selftest(): Promise<void> {
  const secret = "selftest-signing-secret";
  const posted: { channel: string; text: string }[] = [];
  const fakeSlack = createServer(async (slackRequest, slackResponse) => {
    const message = JSON.parse((await readBody(slackRequest)).toString("utf8")) as {
      channel: string;
      text: string;
    };
    posted.push(message);
    respond(slackResponse, 200, { ok: true, ts: "1700000000.000100" });
  });
  const fakeSlackPort = await listen(fakeSlack, 0);

  const app = createSlackApp({
    botUserId: "UBOT",
    transport: createSlackWebApiTransport("xoxb-selftest", `http://127.0.0.1:${fakeSlackPort}`),
  });
  const webhook = createWebhookServer({ app, signingSecret: secret });
  await app.start();
  const webhookPort = await listen(webhook, 0);

  const body = JSON.stringify({
    event: {
      channel: "C123",
      text: "hello from Slack",
      ts: "123.456",
      type: "message",
      user: "U1",
    },
    event_id: "Ev-selftest-1",
    type: "event_callback",
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const response = await fetch(`http://127.0.0.1:${webhookPort}/slack/events`, {
    body,
    headers: {
      "content-type": "application/json",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": sign(secret, timestamp, body),
    },
    method: "POST",
  });

  const forged = await fetch(`http://127.0.0.1:${webhookPort}/slack/events`, {
    body,
    headers: {
      "content-type": "application/json",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": sign("wrong-secret", timestamp, body),
    },
    method: "POST",
  });

  const malformedBody = "{not json";
  const malformed = await fetch(`http://127.0.0.1:${webhookPort}/slack/events`, {
    body: malformedBody,
    headers: {
      "content-type": "application/json",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": sign(secret, timestamp, malformedBody),
    },
    method: "POST",
  });

  const oversized = await fetch(`http://127.0.0.1:${webhookPort}/slack/events`, {
    body: "x".repeat(MAX_BODY_BYTES + 1),
    headers: { "content-type": "application/json" },
    method: "POST",
  }).then((result) => result.status);

  const deadline = Date.now() + 5000;
  while (posted.length === 0 && Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: Polls until the asynchronous reply arrives.
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await app.stop();
  webhook.close();
  fakeSlack.close();

  if (response.status !== 200) {
    throw new Error(`Webhook returned ${response.status}`);
  }
  if (malformed.status !== 400) {
    throw new Error(`A signed malformed body returned ${malformed.status}, expected 400`);
  }
  if (oversized !== 413) {
    throw new Error(`An oversized body returned ${oversized}, expected 413`);
  }
  if (forged.status !== 401) {
    throw new Error(`A forged signature returned ${forged.status}, expected 401`);
  }
  if (posted.length !== 1 || posted[0]?.channel !== "C123") {
    throw new Error(`Expected one reply in C123, received ${JSON.stringify(posted)}`);
  }
  console.log(`selftest passed: replied in ${posted[0].channel} with "${posted[0].text}"`);
}

async function serve(): Promise<void> {
  const token = requiredEnv("SLACK_BOT_TOKEN");
  const secret = requiredEnv("SLACK_SIGNING_SECRET");
  const app = createSlackApp({
    botUserId: process.env.SLACK_BOT_USER_ID,
    transport: createSlackWebApiTransport(
      token,
      process.env.SLACK_API_BASE ?? "https://slack.com/api",
    ),
  });
  await app.start();
  const port = Number(process.env.PORT ?? 3000);
  // Bind to loopback by default so a development server is not reachable from the network.
  // Expose it through a tunnel, or set HOST explicitly when a reverse proxy is in front.
  const host = process.env.HOST ?? "127.0.0.1";
  const server = createWebhookServer({ app, signingSecret: secret });
  server.listen(port, host, () => {
    console.log(`OCP Slack agent listening on http://${host}:${port} (POST /slack/events)`);
  });

  // Stop accepting webhooks, then let in-flight conversations finish before the process exits.
  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close();
    app.stop().finally(() => process.exit(0));
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} (see examples/slack-typescript/README.md)`);
  }
  return value;
}

if (SELFTEST) {
  await selftest();
} else {
  await serve();
}
