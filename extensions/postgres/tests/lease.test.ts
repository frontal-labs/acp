import { ValidationError } from "@frontal-labs/open-channel-core";
import { describe, expect, it } from "vitest";
import { createPostgresEventStore, postgresEventStoreMigration } from "../src/index.js";

function recordingClient() {
  const calls: { sql: string; values: readonly unknown[] | undefined }[] = [];
  return {
    calls,
    client: {
      query: <TRow>(sql: string, values?: readonly unknown[]) => {
        calls.push({ sql, values });
        return Promise.resolve({ rows: [{ action_id: "action:1" }] as TRow[] });
      },
    },
  };
}

describe("@frontal-labs/open-channel-ext-postgres action leases", () => {
  it("claims through one atomic upsert that takes over only expired, still-claimed actions", async () => {
    const { calls, client } = recordingClient();
    const store = createPostgresEventStore({ client, leaseMs: 60_000 });

    expect(await store.claimAction("action:1", "worker-a")).toBe(true);
    const sql = calls[0]?.sql ?? "";
    expect(sql).toContain("ON CONFLICT (action_id) DO UPDATE");
    expect(sql).toContain("acp_actions.status = 'claimed'");
    expect(sql).toContain("INTERVAL '1 millisecond'");
    expect(calls[0]?.values).toEqual(["action:1", "worker-a", 60_000]);
  });

  it("defaults to a five-minute lease and rejects an invalid lease", async () => {
    const { calls, client } = recordingClient();
    await createPostgresEventStore({ client }).claimAction("action:2", "worker-b");
    expect(calls[0]?.values).toEqual(["action:2", "worker-b", 300_000]);

    expect(() => createPostgresEventStore({ client, leaseMs: -1 })).toThrow(ValidationError);
    expect(() => createPostgresEventStore({ client, leaseMs: 1.5 })).toThrow(ValidationError);
  });

  it("adds the claimed_at column to existing action tables", () => {
    expect(postgresEventStoreMigration()).toContain(
      "ALTER TABLE acp_actions ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ",
    );
  });
});
