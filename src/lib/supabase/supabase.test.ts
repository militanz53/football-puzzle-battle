import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Offline checks of the Supabase setup; the live connection test is
// connection.integration.test.ts (npm run test:supabase).

const SRC = path.join(process.cwd(), "src");
const SERVER_MODULE = path.join(SRC, "lib", "supabase", "server.ts");
const ENV_MODULE = path.join(SRC, "lib", "supabase", "env.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : [];
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Supabase environment", () => {
  it("explains which variable is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const { publicSupabaseConfig } = await import("./env");
    expect(() => publicSupabaseConfig()).toThrow(/NEXT_PUBLIC_SUPABASE_URL is not set.*\.env\.example/);
  });

  it("reads the public config", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    const { publicSupabaseConfig } = await import("./env");
    expect(publicSupabaseConfig()).toEqual({ url: "https://example.supabase.co", publishableKey: "sb_publishable_test" });
  });
});

describe("secret key stays on the server", () => {
  it("builds the server client with the secret key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    const { getServerSupabase } = await import("./server");
    expect(getServerSupabase()).toBeDefined();
  });

  it("refuses to create the server client in a browser", async () => {
    vi.stubGlobal("window", {});
    const { getServerSupabase } = await import("./server");
    expect(() => getServerSupabase()).toThrow(/only run on the server/);
  });

  it("marks the server client module server-only", () => {
    expect(readFileSync(SERVER_MODULE, "utf8")).toMatch(/^import "server-only";/m);
  });

  it("reads SUPABASE_SECRET_KEY nowhere but env.ts", () => {
    const readers = sourceFiles(SRC).filter((f) => f !== ENV_MODULE && readFileSync(f, "utf8").includes("SUPABASE_SECRET_KEY"));
    expect(readers.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it("is never imported by a Client Component", () => {
    const offenders = sourceFiles(SRC).filter((f) => {
      const code = readFileSync(f, "utf8");
      return /^["']use client["']/m.test(code) && /lib\/supabase\/(server|env)["']/.test(code);
    });
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});

describe("pingSupabase", () => {
  const clientAnswering = (answer: object | Error) =>
    ({
      from: () => ({
        select: () => ({ limit: () => (answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)) }),
      }),
    }) as never;

  it("counts 'table not found' as connected (the key was accepted)", async () => {
    const { pingSupabase } = await import("./health");
    const result = await pingSupabase(clientAnswering({ status: 404, error: { code: "PGRST205", message: "not found" } }));
    expect(result).toEqual({ ok: true });
  });

  it("reports a rejected key", async () => {
    const { pingSupabase } = await import("./health");
    const result = await pingSupabase(clientAnswering({ status: 401, error: { code: "", message: "Invalid API key" } }));
    expect(result).toEqual({ ok: false, reason: "HTTP 401: Invalid API key" });
  });

  it("reports a network failure", async () => {
    const { pingSupabase } = await import("./health");
    expect(await pingSupabase(clientAnswering(new Error("fetch failed")))).toEqual({ ok: false, reason: "fetch failed" });
  });
});
