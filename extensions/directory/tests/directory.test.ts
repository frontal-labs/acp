import { createTestHuman } from "@frontal-labs/open-channel-testing";
import { describe, expect, it } from "vitest";
import { createGoogleDirectoryProvider } from "../src/index.js";

describe("@frontal-labs/open-channel-ext-directory", () => {
  it("caches directory identity lookups", async () => {
    let calls = 0;
    const provider = createGoogleDirectoryProvider({
      transport: {
        getActor: () => {
          calls += 1;
          return Promise.resolve(createTestHuman());
        },
        getGroupsForActor: () => Promise.resolve([]),
        searchActors: () => Promise.resolve([]),
      },
    });
    await provider.getActor("user:1");
    await provider.getActor("user:1");
    expect(calls).toBe(1);
  });
});
