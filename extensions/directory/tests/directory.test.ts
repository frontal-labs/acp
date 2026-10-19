import { createTestHuman } from "@acp/testing";
import { describe, expect, it } from "vitest";
import { createGoogleDirectoryProvider } from "../src/index.js";

describe("@acp/ext-directory", () => {
  it("caches directory identity lookups", async () => {
    let calls = 0;
    const provider = createGoogleDirectoryProvider({
      transport: {
        getActor: () => {
          calls += 1;
          return createTestHuman();
        },
        getGroupsForActor: () => [],
        searchActors: () => [],
      },
    });
    await provider.getActor("user:1");
    await provider.getActor("user:1");
    expect(calls).toBe(1);
  });
});
