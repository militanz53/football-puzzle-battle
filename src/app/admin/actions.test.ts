import { beforeEach, describe, expect, it, vi } from "vitest";
import { careerPuzzle } from "@/game/__fixtures__/careerPuzzle";
import { ADMIN_COOKIE, createSessionToken } from "@/lib/admin/session";

// Every admin Server Function must refuse a caller without a valid session, before
// touching the database: they can be POSTed to from any URL, so the /admin proxy is
// not enough. The Next.js request APIs and the Supabase store are replaced here.

const PASSWORD = "unit-test-admin-password-123";
const jar = new Map<string, string>();

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (opts: { name: string } | string) => void jar.delete(typeof opts === "string" ? opts : opts.name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const store = vi.hoisted(() => ({
  fetchAllPuzzles: vi.fn(),
  insertPuzzleRows: vi.fn(),
  updatePuzzleRow: vi.fn(),
  deletePuzzleRow: vi.fn(),
  publishPuzzleRows: vi.fn(),
}));
vi.mock("@/data/puzzles", () => store);

const actions = await import("./actions");
const { login, logout } = await import("./login/actions");
const { isAdminSignedIn } = await import("@/lib/admin/auth");

/** One plausible call per exported action. A new export without a case fails below. */
const CALLS: Record<string, () => Promise<unknown>> = {
  savePuzzle: () => actions.savePuzzle(careerPuzzle, null),
  deletePuzzle: () => actions.deletePuzzle(careerPuzzle.id),
  importPuzzles: () => actions.importPuzzles([careerPuzzle]),
  publishPuzzles: () => actions.publishPuzzles([careerPuzzle.id]),
};

beforeEach(() => {
  vi.stubEnv("ADMIN_PANEL_PASSWORD", PASSWORD);
  jar.clear();
  for (const fn of Object.values(store)) fn.mockReset();
  store.fetchAllPuzzles.mockResolvedValue([]);
  store.publishPuzzleRows.mockResolvedValue([]);
});

const storeCalls = () => Object.values(store).reduce((n, fn) => n + fn.mock.calls.length, 0);

describe("admin Server Functions", () => {
  it("are all covered by this test", () => {
    const exported = Object.entries(actions).filter(([, v]) => typeof v === "function").map(([k]) => k);
    expect(exported.sort()).toEqual(Object.keys(CALLS).sort());
  });

  describe.each(Object.keys(CALLS))("%s", (name) => {
    it("sends a caller without a session to the login page, touching nothing", async () => {
      await expect(CALLS[name]()).rejects.toEqual(new Redirect("/admin/login"));
      expect(storeCalls()).toBe(0);
    });

    it("rejects a forged or expired cookie the same way", async () => {
      jar.set(ADMIN_COOKIE, "9999999999999.forged");
      await expect(CALLS[name]()).rejects.toEqual(new Redirect("/admin/login"));
      jar.set(ADMIN_COOKIE, await createSessionToken(PASSWORD, Date.now() - 8 * 24 * 3600 * 1000));
      await expect(CALLS[name]()).rejects.toEqual(new Redirect("/admin/login"));
      expect(storeCalls()).toBe(0);
    });

    it("runs for a signed-in admin", async () => {
      jar.set(ADMIN_COOKIE, await createSessionToken(PASSWORD));
      await CALLS[name]();
      expect(storeCalls()).toBeGreaterThan(0);
    });
  });

  it("fails closed when ADMIN_PANEL_PASSWORD is missing", async () => {
    jar.set(ADMIN_COOKIE, await createSessionToken(PASSWORD));
    vi.stubEnv("ADMIN_PANEL_PASSWORD", "");
    await expect(actions.publishPuzzles(["x"])).rejects.toThrow(/ADMIN_PANEL_PASSWORD is not set/);
    expect(storeCalls()).toBe(0);
  });
});

describe("login and logout", () => {
  const form = (password: string, next = "/admin/import") => {
    const f = new FormData();
    f.set("password", password);
    f.set("next", next);
    return f;
  };

  it("rejects a wrong password with a message and no cookie", async () => {
    expect(await login({ error: null }, form("not-the-password"))).toEqual({ error: "Wrong password." });
    expect(jar.has(ADMIN_COOKIE)).toBe(false);
  });

  it("signs in with the right password and returns to the page asked for", async () => {
    await expect(login({ error: null }, form(PASSWORD))).rejects.toEqual(new Redirect("/admin/import"));
    expect(await isAdminSignedIn()).toBe(true);
  });

  it("does not follow a ?next= that leaves the panel", async () => {
    await expect(login({ error: null }, form(PASSWORD, "https://evil.example"))).rejects.toEqual(new Redirect("/admin"));
  });

  it("signs out", async () => {
    jar.set(ADMIN_COOKIE, await createSessionToken(PASSWORD));
    await expect(logout()).rejects.toEqual(new Redirect("/admin/login"));
    expect(jar.has(ADMIN_COOKIE)).toBe(false);
  });
});
