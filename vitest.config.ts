import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@frontal-labs/open-channel": fileURLToPath(
        new URL("./sdks/typescript/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-adapter": fileURLToPath(
        new URL("./packages/adapter/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-cli": fileURLToPath(
        new URL("./cli/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-ext-a2a": fileURLToPath(
        new URL("./extensions/a2a/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-ext-calendar": fileURLToPath(
        new URL("./extensions/calendar/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-ext-directory": fileURLToPath(
        new URL("./extensions/directory/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-ext-email": fileURLToPath(
        new URL("./extensions/email/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-ext-google-chat": fileURLToPath(
        new URL("./extensions/google-chat/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-ext-mcp": fileURLToPath(
        new URL("./extensions/mcp/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-ext-microsoft-teams": fileURLToPath(
        new URL("./extensions/microsoft-teams/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-ext-opentelemetry": fileURLToPath(
        new URL("./extensions/opentelemetry/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-ext-policy-cedar": fileURLToPath(
        new URL("./extensions/policy-cedar/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-ext-policy-opa": fileURLToPath(
        new URL("./extensions/policy-opa/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-ext-postgres": fileURLToPath(
        new URL("./extensions/postgres/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-ext-shared": fileURLToPath(
        new URL("./extensions/shared/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-ext-slack": fileURLToPath(
        new URL("./extensions/slack/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-ext-whatsapp": fileURLToPath(
        new URL("./extensions/whatsapp/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-policy": fileURLToPath(
        new URL("./packages/policy/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-protocol": fileURLToPath(
        new URL("./packages/protocol/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-runtime": fileURLToPath(
        new URL("./packages/runtime/src/index.ts", import.meta.url),
      ),
      "@frontal-labs/open-channel-testing": fileURLToPath(
        new URL("./packages/testing/src/index.ts", import.meta.url),
      ),
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
