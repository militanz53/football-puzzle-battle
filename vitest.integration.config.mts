import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

// Talks to the Supabase project in .env.local; needs network access.
// Standalone rather than merged with vitest.config.mts: merging concatenates
// arrays, so the base config's exclude would still hide these tests.
export default defineConfig({
  resolve: {
    alias: {
      "@": src(""),
      "server-only": src("test/server-only.ts"),
    },
  },
  test: {
    include: ["src/**/*.integration.test.ts"],
    environment: "node",
    setupFiles: ["src/test/load-env.ts"],
    testTimeout: 20_000,
  },
});
