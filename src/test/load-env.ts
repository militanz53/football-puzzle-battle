import { loadEnvConfig } from "@next/env";

// Integration tests read .env.local exactly as `next dev` does. Next skips .env.local
// when NODE_ENV is "test" (Vitest's default), so load in development mode, then restore.
const nodeEnv = process.env.NODE_ENV;
Object.assign(process.env, { NODE_ENV: "development" });
loadEnvConfig(process.cwd(), true);
// Put it back exactly: assigning undefined would store the string "undefined".
if (nodeEnv === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
else Object.assign(process.env, { NODE_ENV: nodeEnv });
