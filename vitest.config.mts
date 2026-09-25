import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": src(""),
      "server-only": src("test/server-only.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Tests that reach real services run separately: npm run test:supabase.
    exclude: [...configDefaults.exclude, "src/**/*.integration.test.ts"],
    environment: "node",
  },
});
