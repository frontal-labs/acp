/** Result shape shared by node-postgres and compatible clients. */
export interface PostgresQueryResult<TRow> {
  rows: TRow[];
}

/** Minimal PostgreSQL client port; applications may inject `pg.Pool`. */
export interface PostgresClient {
  query: <TRow = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ) => Promise<PostgresQueryResult<TRow>>;
}

/** PostgreSQL store configuration. */
export interface PostgresEventStoreOptions {
  client: PostgresClient;
  /**
   * How long a claimed action may stay in progress before another worker can take it over.
   * Without a lease, a worker that crashes after claiming blocks its action ID forever.
   * Defaults to five minutes. Completed and failed actions are never taken over.
   */
  leaseMs?: number;
  tableName?: string;
}

/** Database row shape for persisted OCP events. */
export interface PostgresEventRow {
  causation_id: string;
  correlation_id: string;
  event_id: string;
  event_json: string | Record<string, unknown>;
  event_type: string;
  idempotency_key: string;
  occurred_at: string;
  protocol_version: string;
}
