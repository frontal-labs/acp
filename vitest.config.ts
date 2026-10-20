import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@acp/adapter": fileURLToPath(new URL("./packages/adapter/src/index.ts", import.meta.url)),
      "@acp/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@acp/ext-a2a": fileURLToPath(new URL("./extensions/a2a/src/index.ts", import.meta.url)),
      "@acp/ext-calendar": fileURLToPath(
        new URL("./extensions/calendar/src/index.ts", import.meta.url),
      ),
      "@acp/ext-directory": fileURLToPath(
        new URL("./extensions/directory/src/index.ts", import.meta.url),
      ),
      "@acp/ext-email": fileURLToPath(new URL("./extensions/email/src/index.ts", import.meta.url)),
      "@acp/ext-google-chat": fileURLToPath(
        new URL("./extensions/google-chat/src/index.ts", import.meta.url),
      ),
      "@acp/ext-mcp": fileURLToPath(new URL("./extensions/mcp/src/index.ts", import.meta.url)),
      "@acp/ext-microsoft-teams": fileURLToPath(
        new URL("./extensions/microsoft-teams/src/index.ts", import.meta.url),
      ),
      "@acp/ext-opentelemetry": fileURLToPath(
        new URL("./extensions/opentelemetry/src/index.ts", import.meta.url),
      ),
      "@acp/ext-policy-cedar": fileURLToPath(
        new URL("./extensions/policy-cedar/src/index.ts", import.meta.url),
      ),
      "@acp/ext-policy-opa": fileURLToPath(
        new URL("./extensions/policy-opa/src/index.ts", import.meta.url),
      ),
      "@acp/ext-postgres": fileURLToPath(
        new URL("./extensions/postgres/src/index.ts", import.meta.url),
      ),
      "@acp/ext-shared": fileURLToPath(
        new URL("./extensions/shared/src/index.ts", import.meta.url),
      ),
      "@acp/ext-slack": fileURLToPath(new URL("./extensions/slack/src/index.ts", import.meta.url)),
      "@acp/ext-whatsapp": fileURLToPath(
        new URL("./extensions/whatsapp/src/index.ts", import.meta.url),
      ),
      "@acp/policy": fileURLToPath(new URL("./packages/policy/src/index.ts", import.meta.url)),
      "@acp/protocol": fileURLToPath(new URL("./packages/protocol/src/index.ts", import.meta.url)),
      "@acp/runtime": fileURLToPath(new URL("./packages/runtime/src/index.ts", import.meta.url)),
      "@acp/testing": fileURLToPath(new URL("./packages/testing/src/index.ts", import.meta.url)),
      "acp-cli": fileURLToPath(new URL("./cli/src/index.ts", import.meta.url)),
      "acp-sdk": fileURLToPath(new URL("./sdks/typescript/src/index.ts", import.meta.url)),
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
