import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getProfile, PROFILES_TABLE } from "@/lib/account/profiles";
import { getPublicSupabase } from "@/lib/supabase/public";
import { getServerSupabase } from "@/lib/supabase/server";
import { QUEUE_TABLE, supabaseQueueStore } from "./queueStore";
import { checkIn, createMatch, defaultDeps, runOnMatch } from "./runner";
import { LEAVE_AFTER_MS, START_GRACE_MS, startRound } from "./service";
import { MATCHES_TABLE } from "./store";

// Live checks of Ranked (§13.5, §14) against the Supabase project in .env.local:
// npm run test:supabase. Two throwaway accounts are made and deleted again (their
// profiles, queue entries and matches go with them).

const admin = () => getServerSupabase();
const users: string[] = [];
const matches: string[] = [];
const entries: string[] = [];

async function account(username: string, rating: number): Promise<string> {
  const email = `it-${crypto.randomUUID()}@example.com`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: crypto.randomUUID(), email_confirm: true });
  if (error) throw new Error(error.message);
  users.push(data.user.id);
  const insert = await admin().from(PROFILES_TABLE).insert({ user_id: data.user.id, username, rating });
  if (insert.error) throw new Error(insert.error.message);
  return data.user.id;
}

let alice = "";
let bob = "";
const suffix = String(Date.now()).slice(-6);

beforeAll(async () => {
  alice = await account(`itA_${suffix}`, 1390);
  bob = await account(`itB_${suffix}`, 1410);
});

afterAll(async () => {
  if (matches.length) await admin().from(MATCHES_TABLE).delete().in("id", matches);
  if (entries.length) await admin().from(QUEUE_TABLE).delete().in("id", entries);
  for (const id of users) await admin().auth.admin.deleteUser(id); // profiles cascade
});

describe("profiles", () => {
  it("start at 1200 with no matches, unless told otherwise", async () => {
    const id = await account(`itC_${suffix}`, 1200);
    expect(await getProfile(id, admin())).toMatchObject({ rating: 1200, tier: "Pro", matchesPlayed: 0, matchesWon: 0, matchesLost: 0 });
  });

  it("refuse a username that differs only in case", async () => {
    const { data } = await admin().auth.admin.createUser({ email: `it-${crypto.randomUUID()}@example.com`, password: crypto.randomUUID(), email_confirm: true });
    users.push(data.user!.id);
    const clash = await admin().from(PROFILES_TABLE).insert({ user_id: data.user!.id, username: `ITA_${suffix}` });
    expect(clash.error?.code).toBe("23505");
  });

  it("are closed to the publishable key", async () => {
    const read = await getPublicSupabase().from(PROFILES_TABLE).select("user_id").limit(1);
    const write = await getPublicSupabase().from(PROFILES_TABLE).update({ rating: 3000 }).eq("user_id", alice).select("user_id");
    expect(read.error?.code).toBe("42501");
    expect(write.error?.code).toBe("42501");
    expect((await getProfile(alice, admin()))?.rating).toBe(1390);
  });
});

describe("ranked lane of match_queue", () => {
  const store = () => supabaseQueueStore(admin());
  const join = async (session: string, userId?: string) => {
    const entry = await store().insert(session, Date.now() + 20_000, "Player_0001", userId);
    entries.push(entry.id);
    await store().touch(entry.id); // its screen polled once: now it can be paired
    return entry;
  };
  // Each test starts with no waiting entries of ours: a leftover would be a valid partner.
  beforeEach(async () => {
    if (entries.length) await admin().from(QUEUE_TABLE).update({ status: "abandoned" }).in("id", entries).eq("status", "waiting");
  });

  it("never pairs a ranked player with a Quick Match player", async () => {
    const quick = await join("it-lane-quick");
    const ranked = await join("it-lane-ranked", alice);
    expect(ranked).toMatchObject({ mode: "ranked", userId: alice });
    expect(quick).toMatchObject({ mode: "quick", userId: null });
    expect(await store().claimPartner(ranked.id, 5)).toBeNull();
    expect(await store().claimPartner(quick.id, 5)).toBeNull();
  });

  it("pairs two ranked players", async () => {
    const a = await join("it-lane-a", alice);
    const b = await join("it-lane-b", bob);
    expect(await store().claimPartner(b.id, 5)).toBe(a.id);
  });

  it("never pairs an account with itself on two browsers", async () => {
    await join("it-lane-laptop", alice);
    const phone = await join("it-lane-phone", alice);
    expect(await store().claimPartner(phone.id, 5)).toBeNull();
  });

  it("still pairs two Quick Match players as before", async () => {
    const a = await join("it-lane-q1");
    const b = await join("it-lane-q2");
    expect(await store().claimPartner(b.id, 5)).toBe(a.id);
  });
});

describe("settling a ranked match", () => {
  it("updates both profiles by Elo exactly once", async () => {
    let now = Date.now();
    const deps = { ...defaultDeps(), now: () => now };
    const players = {
      a: { session: "it-rk-a", name: `itA_${suffix}`, account: { userId: alice, rating: 1390 } },
      b: { session: "it-rk-b", name: `itB_${suffix}`, account: { userId: bob, rating: 1410 } },
      since: now,
    };
    const view = await createMatch(
      deps,
      players.b.name,
      { opponentKind: "human", queueEntryId: null, playerSession: "it-rk-a", opponentSession: "it-rk-b", mode: "ranked" },
      players,
    );
    matches.push(view.id);
    await runOnMatch(view.id, startRound, deps, "it-rk-a");
    now += START_GRACE_MS + LEAVE_AFTER_MS + 1_000; // seat b never checks in: seat a wins
    const over = await checkIn(view.id, "it-rk-a", deps);
    expect(over?.ranked?.change).toEqual({ before: 1390, after: 1407, delta: 17, tierBefore: "Pro", tierAfter: "Elite" });

    // Every later request (and a second settle attempt) leaves the ratings alone.
    await runOnMatch(view.id, (r) => ({ record: r, changed: false }), deps, "it-rk-b");
    const again = await admin().rpc("settle_ranked_match", { p_match: view.id, p_result: { a: { delta: 999 }, b: { delta: 999 } } });
    expect(again.data).toMatchObject({ a: { delta: 17 }, b: { delta: -17 } });

    expect(await getProfile(alice, admin())).toMatchObject({ rating: 1407, tier: "Elite", matchesPlayed: 1, matchesWon: 1, matchesLost: 0 });
    expect(await getProfile(bob, admin())).toMatchObject({ rating: 1393, tier: "Pro", matchesPlayed: 1, matchesWon: 0, matchesLost: 1 });
    const { data } = await admin().from(MATCHES_TABLE).select("mode, ranked_result").eq("id", view.id).single();
    expect(data).toMatchObject({ mode: "ranked", ranked_result: { a: { after: 1407 }, b: { after: 1393 } } });
  });

  it("refuses to settle a Quick Match or an unfinished match", async () => {
    const deps = defaultDeps();
    const quick = await createMatch(deps, "Emre_34", { opponentKind: "bot", queueEntryId: null, playerSession: null });
    matches.push(quick.id);
    const result = await admin().rpc("settle_ranked_match", { p_match: quick.id, p_result: { a: { delta: 5 }, b: { delta: -5 } } });
    expect(result.data).toBeNull();
  });

  it("cannot be called with the publishable key", async () => {
    const rpc = await getPublicSupabase().rpc("settle_ranked_match", { p_match: crypto.randomUUID(), p_result: {} });
    expect(rpc.error).not.toBeNull();
  });
});
