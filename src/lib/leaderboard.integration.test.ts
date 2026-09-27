import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROFILES_TABLE } from "@/lib/account/profiles";
import { getPublicSupabase } from "@/lib/supabase/public";
import { getServerSupabase } from "@/lib/supabase/server";
import { LEADERBOARD_VIEW, leaderboardEntry, topPlayers } from "./leaderboard";

// Live checks of the public leaderboard view against the Supabase project in
// .env.local: npm run test:supabase. Four throwaway accounts are made with extreme
// ratings (so they sort predictably among real players) and deleted afterwards.

const admin = () => getServerSupabase();
const anon = () => getPublicSupabase();
const users: string[] = [];
const suffix = String(Date.now()).slice(-6);
const name = (tag: string) => `lb${tag}_${suffix}`;

async function account(tag: string, rating: number, played: number): Promise<void> {
  const { data, error } = await admin().auth.admin.createUser({ email: `it-${crypto.randomUUID()}@example.com`, password: crypto.randomUUID(), email_confirm: true });
  if (error) throw new Error(error.message);
  users.push(data.user.id);
  const insert = await admin()
    .from(PROFILES_TABLE)
    .insert({ user_id: data.user.id, username: name(tag), rating, matches_played: played, matches_won: played, matches_lost: 0 });
  if (insert.error) throw new Error(insert.error.message);
}

beforeAll(async () => {
  await account("A", 9001, 3); // far above any real player
  await account("B", 9000, 2);
  await account("C", 9000, 1); // ties with B
  await account("N", 9999, 0); // never played: not on the board
});
afterAll(async () => {
  for (const id of users) await admin().auth.admin.deleteUser(id);
});

describe("leaderboard view", () => {
  it("lists players by rating, highest first, with shared positions for equal ratings", async () => {
    const top = (await topPlayers(10, anon())).filter((e) => e.username.endsWith(suffix));
    expect(top.map((e) => [e.position, e.username, e.rating])).toEqual([
      [1, name("A"), 9001],
      [2, name("B"), 9000],
      [2, name("C"), 9000],
    ]);
    expect(top[0]).toMatchObject({ tier: "GOAT", matchesPlayed: 3, matchesWon: 3 });
  });

  it("leaves out players who have not played a ranked match", async () => {
    expect(await leaderboardEntry(name("N"), anon())).toBeNull();
  });

  it("gives the publishable key the public columns and nothing else", async () => {
    const { data, error } = await anon().from(LEADERBOARD_VIEW).select("*").limit(1);
    expect(error).toBeNull();
    expect(Object.keys(data![0]).sort()).toEqual(["matches_lost", "matches_played", "matches_won", "position", "rating", "username"]);
    for (const column of ["user_id", "email", "created_at"]) {
      expect((await anon().from(LEADERBOARD_VIEW).select(column).limit(1)).error).not.toBeNull();
    }
  });

  it("keeps the profiles table itself closed to the publishable key", async () => {
    const read = await anon().from(PROFILES_TABLE).select("username").limit(1);
    expect(read.error?.code).toBe("42501");
  });

  it("cannot be written through", async () => {
    const write = await anon().from(LEADERBOARD_VIEW).update({ rating: 1 }).eq("username", name("A")).select("username");
    expect(write.error).not.toBeNull();
  });
});
