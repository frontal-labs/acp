import { ValidationError } from "@frontal-labs/open-channel-core";
import { createTestEvent } from "@frontal-labs/open-channel-testing";
import { describe, expect, it } from "vitest";
import {
  createPostgresEventStore,
  migratePostgresEventStore,
  postgresEventStoreMigration,
} from "../src/index.js";

function recordingClient() {
  const statements: string[] = [];
  return {
    client: {
      query: <TRow>(sql: string) => {
        statements.push(sql);
        return Promise.resolve({ rows: [] as TRow[] });
      },
    },
    statements,
  };
}

describe("@frontal-labs/open-channel-ext-postgres migration", () => {
  it("creates the table the store writes to when a custom table name is configured", async () => {
    const { client, statements } = recordingClient();
    await migratePostgresEventStore(client, { tableName: "orders_events" });
    const store = createPostgresEventStore({ client, tableName: "orders_events" });
    await store.append(createTestEvent({ eventId: "event:custom" }));

    const migration = statements[0] ?? "";
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS orders_events");
    expect(migration).toContain("orders_events_type_idx");
    expect(migration).not.toContain("acp_events");
    expect(statements[1]).toContain("INSERT INTO orders_events");
  });

  it("defaults to acp_events", () => {
    expect(postgresEventStoreMigration()).toContain("CREATE TABLE IF NOT EXISTS acp_events");
  });

  it("rejects a table name that is not a plain identifier", async () => {
    const { client, statements } = recordingClient();
    expect(() => postgresEventStoreMigration("events; DROP TABLE users")).toThrow(ValidationError);
    await expect(
      migratePostgresEventStore(client, { tableName: "events; DROP TABLE users" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(statements).toHaveLength(0);
    expect(() => createPostgresEventStore({ client, tableName: "Bad-Name" })).toThrow(
      ValidationError,
    );
  });
});
