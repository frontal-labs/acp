/** Result shape shared by node-postgres and compatible clients. */
export interface PostgresQueryResult<TRow> {
  rows: TRow[];
}

/**
 * Minimal PostgreSQL client port; applications may inject `pg.Pool`. The store only calls
 * `query`, with SQL text that uses `$1, $2, ...` placeholders and a separate values array.
 */
export interface PostgresClient {
  query: <TRow = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ) => Promise<PostgresQueryResult<TRow>>;
}

/** PostgreSQL store configuration. */
export interface PostgresEventStoreOptions {
  /** Client used for every statement. Required. */
  client: PostgresClient;
  /**
   * How long a claimed action may stay in progress before another worker can take it over.
   * Without a lease, a worker that crashes after claiming blocks its action ID forever.
   * Defaults to five minutes. Completed and failed actions are never taken over.
   */
  leaseMs?: number;
  /**
   * Table that stores events. Must match `[a-z_][a-z0-9_]*`. Run `postgresEventStoreMigration`
   * with the same name first. Defaults to `ocp_events`.
   */
  tableName?: string;
}

/** Database row shape for persisted OCP events. */
export interface PostgresEventRow {
  causation_id: string;
  correlation_id: string;
  event_id: string;
  /** JSONB arrives as an object from node-postgres. A string is also accepted. */
  event_json: string | Record<string, unknown>;
  event_type: string;
  idempotency_key: string;
  occurred_at: string;
  protocol_version: string;
}
