import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@acp/adapter": new URL("./packages/adapter/src/index.ts", import.meta.url).pathname,
      "@acp/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@acp/ext-a2a": new URL("./extensions/a2a/src/index.ts", import.meta.url).pathname,
      "@acp/ext-calendar": new URL("./extensions/calendar/src/index.ts", import.meta.url).pathname,
      "@acp/ext-directory": new URL("./extensions/directory/src/index.ts", import.meta.url)
        .pathname,
      "@acp/ext-email": new URL("./extensions/email/src/index.ts", import.meta.url).pathname,
      "@acp/ext-google-chat": new URL("./extensions/google-chat/src/index.ts", import.meta.url)
        .pathname,
      "@acp/ext-mcp": new URL("./extensions/mcp/src/index.ts", import.meta.url).pathname,
      "@acp/ext-microsoft-teams": new URL(
        "./extensions/microsoft-teams/src/index.ts",
        import.meta.url,
      ).pathname,
      "@acp/ext-opentelemetry": new URL("./extensions/opentelemetry/src/index.ts", import.meta.url)
        .pathname,
      "@acp/ext-policy-cedar": new URL("./extensions/policy-cedar/src/index.ts", import.meta.url)
        .pathname,
      "@acp/ext-policy-opa": new URL("./extensions/policy-opa/src/index.ts", import.meta.url)
        .pathname,
      "@acp/ext-postgres": new URL("./extensions/postgres/src/index.ts", import.meta.url).pathname,
      "@acp/ext-shared": new URL("./extensions/shared/src/index.ts", import.meta.url).pathname,
      "@acp/ext-slack": new URL("./extensions/slack/src/index.ts", import.meta.url).pathname,
      "@acp/ext-whatsapp": new URL("./extensions/whatsapp/src/index.ts", import.meta.url).pathname,
      "@acp/policy": new URL("./packages/policy/src/index.ts", import.meta.url).pathname,
      "@acp/protocol": new URL("./packages/protocol/src/index.ts", import.meta.url).pathname,
      "@acp/runtime": new URL("./packages/runtime/src/index.ts", import.meta.url).pathname,
      "@acp/testing": new URL("./packages/testing/src/index.ts", import.meta.url).pathname,
      "acp-cli": new URL("./cli/src/index.ts", import.meta.url).pathname,
      "acp-sdk": new URL("./sdks/typescript/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    globals: true,
    include: [
      "tests/**/*.test.ts",
      "packages/**/tests/**/*.test.ts",
      "cli/tests/**/*.test.ts",
      "sdks/typescript/tests/**/*.test.ts",
      "extensions/**/tests/**/*.test.ts",
    ],
  },
});
