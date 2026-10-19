import { createTestEvent } from "@acp/testing";
import { describe, expect, it } from "vitest";
import { createPostgresEventStore } from "../src/index.js";

describe("@acp/ext-postgres", () => {
  it("uses appendIfAbsent for runtime idempotency", async () => {
    let inserted = false;
    const store = createPostgresEventStore({
      client: {
        query: <TRow>(sql: string) => {
          if (sql.includes("RETURNING event_id")) {
            if (inserted) {
              return Promise.resolve({ rows: [] as TRow[] });
            }
            inserted = true;
            return Promise.resolve({ rows: [{ event_id: "event:1" }] as TRow[] });
          }
          return Promise.resolve({ rows: [] as TRow[] });
        },
      },
    });
    const event = createTestEvent({ eventId: "event:1" });
    expect(await store.appendIfAbsent(event)).toBe(true);
    expect(await store.appendIfAbsent(event)).toBe(false);
  });
});
