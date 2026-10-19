import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@acp/adapter": new URL("./packages/adapter/src/index.ts", import.meta.url).pathname,
      "@acp/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@acp/policy": new URL("./packages/policy/src/index.ts", import.meta.url).pathname,
      "@acp/protocol": new URL("./packages/protocol/src/index.ts", import.meta.url).pathname,
      "@acp/runtime": new URL("./packages/runtime/src/index.ts", import.meta.url).pathname,
      "@acp/testing": new URL("./packages/testing/src/index.ts", import.meta.url).pathname,
      "acp-cli": new URL("./cli/src/index.ts", import.meta.url).pathname,
      "acp-sdk-ts": new URL("./sdks/typescript/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    globals: true,
    include: [
      "tests/**/*.test.ts",
      "packages/**/tests/**/*.test.ts",
      "cli/tests/**/*.test.ts",
      "sdks/typescript/tests/**/*.test.ts",
    ],
  },
});
