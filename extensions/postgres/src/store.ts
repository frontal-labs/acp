import { ValidationError } from "@acp/core";
import type { EventEnvelope } from "@acp/protocol";
import { eventFromJson, eventToJson } from "@acp/protocol";
import type { ActionExecutionRecord, EventStore } from "@acp/runtime";

import type { PostgresClient, PostgresEventRow, PostgresEventStoreOptions } from "./types.js";

const TABLE_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/u;

/** SQL migration for the append-only ACP event table. */
export const POSTGRES_EVENT_STORE_MIGRATION = `
CREATE TABLE IF NOT EXISTS acp_events (
  sequence BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  correlation_id TEXT NOT NULL DEFAULT '',
  causation_id TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL DEFAULT '',
  event_json JSONB NOT NULL,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS acp_events_type_idx ON acp_events (event_type, sequence);
CREATE INDEX IF NOT EXISTS acp_events_correlation_idx ON acp_events (correlation_id, sequence);
CREATE INDEX IF NOT EXISTS acp_events_idempotency_idx ON acp_events (idempotency_key);
CREATE TABLE IF NOT EXISTS acp_actions (
  action_id TEXT PRIMARY KEY,
  owner TEXT,
  status TEXT NOT NULL,
  result_json JSONB,
  error_json JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

function tableName(value: string | undefined): string {
  const name = value ?? "acp_events";
  if (!TABLE_NAME_PATTERN.test(name)) {
    throw new ValidationError(`Invalid PostgreSQL table name: ${name}`, {
      provider: "postgres",
      stage: "validation",
    });
  }
  return name;
}

function decode(row: PostgresEventRow): EventEnvelope {
  const value = typeof row.event_json === "string" ? JSON.parse(row.event_json) : row.event_json;
  return eventFromJson(value);
}

/** Durable EventStore implementation backed by an injected PostgreSQL client. */
export class PostgresEventStore implements EventStore {
  private readonly client: PostgresClient;
  private readonly table: string;

  constructor(options: PostgresEventStoreOptions) {
    this.client = options.client;
    this.table = tableName(options.tableName);
  }

  async append(event: EventEnvelope): Promise<void> {
    await this.client.query(
      `INSERT INTO ${this.table} (event_id, event_type, protocol_version, occurred_at, correlation_id, causation_id, idempotency_key, event_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        event.eventId,
        event.eventType,
        event.protocolVersion,
        event.occurredAt
          ? new Date(Number(event.occurredAt.seconds) * 1000 + event.occurredAt.nanos / 1_000_000)
          : new Date(),
        event.correlationId,
        event.causationId,
        event.idempotencyKey,
        JSON.stringify(eventToJson(event)),
      ],
    );
  }

  async appendIfAbsent(event: EventEnvelope): Promise<boolean> {
    const result = await this.client.query<{ event_id: string }>(
      `INSERT INTO ${this.table} (event_id, event_type, protocol_version, occurred_at, correlation_id, causation_id, idempotency_key, event_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [
        event.eventId,
        event.eventType,
        event.protocolVersion,
        event.occurredAt
          ? new Date(Number(event.occurredAt.seconds) * 1000 + event.occurredAt.nanos / 1_000_000)
          : new Date(),
        event.correlationId,
        event.causationId,
        event.idempotencyKey,
        JSON.stringify(eventToJson(event)),
      ],
    );
    return result.rows.length > 0;
  }

  async has(eventId: string): Promise<boolean> {
    const result = await this.client.query<{ event_id: string }>(
      `SELECT event_id FROM ${this.table} WHERE event_id = $1 LIMIT 1`,
      [eventId],
    );
    return result.rows.length > 0;
  }

  async get(eventId: string): Promise<EventEnvelope | undefined> {
    const result = await this.client.query<PostgresEventRow>(
      `SELECT event_id, event_type, protocol_version, occurred_at, correlation_id, causation_id, idempotency_key, event_json
       FROM ${this.table} WHERE event_id = $1 LIMIT 1`,
      [eventId],
    );
    const [row] = result.rows;
    return row ? decode(row) : undefined;
  }

  async list(options: { eventType?: string; limit?: number } = {}): Promise<EventEnvelope[]> {
    const values: unknown[] = [];
    const filters: string[] = [];
    if (options.eventType) {
      values.push(options.eventType);
      filters.push(`event_type = $${values.length}`);
    }
    const limit = Math.max(0, Math.floor(options.limit ?? 10_000));
    values.push(limit);
    const result = await this.client.query<PostgresEventRow>(
      `SELECT event_id, event_type, protocol_version, occurred_at, correlation_id, causation_id, idempotency_key, event_json
       FROM ${this.table}${filters.length ? ` WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY sequence ASC LIMIT $${values.length}`,
      values,
    );
    return result.rows.map(decode);
  }

  all(): Promise<EventEnvelope[]> {
    return this.list({ limit: 10_000_000 });
  }

  query(options: { eventType?: string; limit?: number } = {}): Promise<EventEnvelope[]> {
    return this.list(options);
  }

  async claimAction(actionId: string, owner: string): Promise<boolean> {
    const result = await this.client.query<{ action_id: string }>(
      `INSERT INTO acp_actions (action_id, owner, status)
       VALUES ($1, $2, 'claimed')
       ON CONFLICT (action_id) DO NOTHING
       RETURNING action_id`,
      [actionId, owner],
    );
    return result.rows.length > 0;
  }

  async completeAction(actionId: string, result: unknown): Promise<void> {
    await this.client.query(
      `UPDATE acp_actions SET status = 'completed', result_json = $2::jsonb, updated_at = NOW()
       WHERE action_id = $1`,
      [actionId, JSON.stringify(result)],
    );
  }

  async failAction(actionId: string, error: unknown): Promise<void> {
    await this.client.query(
      `UPDATE acp_actions SET status = 'failed', error_json = $2::jsonb, updated_at = NOW()
       WHERE action_id = $1`,
      [actionId, JSON.stringify(error)],
    );
  }

  async getAction(actionId: string): Promise<ActionExecutionRecord | undefined> {
    const result = await this.client.query<{
      action_id: string;
      error_json: unknown;
      owner: string | null;
      result_json: unknown;
      status: ActionExecutionRecord["status"];
    }>(
      "SELECT action_id, owner, status, result_json, error_json FROM acp_actions WHERE action_id = $1",
      [actionId],
    );
    const [row] = result.rows;
    return row
      ? {
          actionId: row.action_id,
          error: row.error_json ?? undefined,
          owner: row.owner ?? undefined,
          result: row.result_json ?? undefined,
          status: row.status,
        }
      : undefined;
  }
}

/** Runs the PostgreSQL event-store migration. */
export async function migratePostgresEventStore(client: PostgresClient): Promise<void> {
  await client.query(POSTGRES_EVENT_STORE_MIGRATION);
}

/** Creates a runtime-compatible PostgreSQL EventStore. */
export function createPostgresEventStore(options: PostgresEventStoreOptions): PostgresEventStore {
  return new PostgresEventStore(options);
}
