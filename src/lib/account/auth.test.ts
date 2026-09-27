import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, fakeTable, type FakeTable } from "@/test/fakeSupabase";
import { ACCOUNT_COOKIE } from "./token";

// The account flow (sign up → signed in → sign out → sign in) against an in-memory
// profiles table, a stand-in for Supabase Auth and a cookie jar. No network.

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: ({ name }: { name: string }) => void jar.delete(name),
  }),
}));

/** Supabase Auth: users by email, with their passwords. */
const users = new Map<string, { id: string; password: string }>();
let profiles: FakeTable;
const createUser = vi.fn(async ({ email, password }: { email: string; password: string }) => {
  if (users.has(email)) return { data: { user: null }, error: { code: "email_exists", message: "already registered" } };
  const user = { id: crypto.randomUUID(), password };
  users.set(email, user);
  return { data: { user: { id: user.id } }, error: null };
});
const deleteUser = vi.fn(async (id: string) => {
  for (const [email, u] of users) if (u.id === id) users.delete(email);
  return { error: null };
});

vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: () => ({ ...fakeSupabase(profiles, "secret"), auth: { admin: { createUser, deleteUser } } }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const user = users.get(email);
        return user && user.password === password
          ? { data: { user: { id: user.id } }, error: null }
          : { data: { user: null }, error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" } };
      },
    },
  }),
}));

beforeEach(() => {
  jar.clear();
  users.clear();
  profiles = fakeTable();
  profiles.unique = [(row) => String(row.username).toLowerCase(), (row) => row.user_id];
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  // The profiles table fills in the defaults a real insert would get.
  const insert = profiles.rows.push.bind(profiles.rows);
  profiles.rows.push = (...rows) => insert(...rows.map((r) => ({ rating: 1200, matches_played: 0, matches_won: 0, matches_lost: 0, ...r })));
});
afterEach(() => vi.unstubAllEnvs());

const { currentAccount, endAccountSession, signIn, signUp } = await import("./auth");

describe("account flow", () => {
  it("signs up: an Auth user, a profile at 1200 (PRO), and a signed-in cookie", async () => {
    expect(await signUp("kadir@example.com", "correct horse", "Kadir")).toEqual({ ok: true });
    expect(createUser).toHaveBeenLastCalledWith({ email: "kadir@example.com", password: "correct horse", email_confirm: true });
    expect(jar.get(ACCOUNT_COOKIE)).toMatch(/^[0-9a-f-]{36}\.\d+\.[\w-]+$/);
    expect(await currentAccount()).toMatchObject({ username: "Kadir", rating: 1200, tier: "Pro", matchesPlayed: 0 });
  });

  it("signs out and back in with the same email and password", async () => {
    await signUp("kadir@example.com", "correct horse", "Kadir");
    const id = (await currentAccount())!.userId;
    await endAccountSession();
    expect(jar.has(ACCOUNT_COOKIE)).toBe(false);
    expect(await currentAccount()).toBeNull();

    expect(await signIn("kadir@example.com", "correct horse")).toEqual({ ok: true });
    expect((await currentAccount())?.userId).toBe(id);
  });

  it("refuses a wrong password and leaves the player signed out", async () => {
    await signUp("kadir@example.com", "correct horse", "Kadir");
    await endAccountSession();
    expect(await signIn("kadir@example.com", "wrong horse")).toEqual({ ok: false, error: "Wrong email or password." });
    expect(await signIn("nobody@example.com", "correct horse")).toEqual({ ok: false, error: "Wrong email or password." });
    expect(jar.has(ACCOUNT_COOKIE)).toBe(false);
  });

  it("keeps usernames unique whatever the case, without creating a user", async () => {
    await signUp("kadir@example.com", "correct horse", "Kadir");
    await endAccountSession();
    createUser.mockClear();
    expect(await signUp("other@example.com", "correct horse", "KADIR")).toEqual({ ok: false, error: "That username is taken." });
    expect(createUser).not.toHaveBeenCalled();
    expect(users.has("other@example.com")).toBe(false);
  });

  it("removes the Auth user again if the username was taken in the meantime", async () => {
    // Someone else takes the name between our check and our insert.
    const create = createUser.getMockImplementation()!;
    createUser.mockImplementationOnce(async (args) => {
      profiles.rows.push({ user_id: "0b6f3c1e-8d2a-4f5b-9c7d-1e2f3a4b5c6d", username: "kadir" });
      return create(args);
    });
    expect(await signUp("kadir@example.com", "correct horse", "Kadir")).toEqual({ ok: false, error: "That username is taken." });
    expect(deleteUser).toHaveBeenCalled();
    expect(users.has("kadir@example.com")).toBe(false);
    expect(jar.has(ACCOUNT_COOKIE)).toBe(false);
  });

  it("refuses a second account for the same email", async () => {
    await signUp("kadir@example.com", "correct horse", "Kadir");
    expect(await signUp("kadir@example.com", "correct horse", "Kadir2")).toMatchObject({ ok: false, error: /already exists/ });
  });

  it("ignores a tampered cookie", async () => {
    await signUp("kadir@example.com", "correct horse", "Kadir");
    jar.set(ACCOUNT_COOKIE, jar.get(ACCOUNT_COOKIE)!.replace(/.$/, (c) => (c === "A" ? "B" : "A")));
    expect(await currentAccount()).toBeNull();
  });
});
