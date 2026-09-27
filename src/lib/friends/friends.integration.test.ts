import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getProfile, PROFILES_TABLE } from "@/lib/account/profiles";
import { getPublicSupabase } from "@/lib/supabase/public";
import { getServerSupabase } from "@/lib/supabase/server";
import { friendlyMatchMaker } from "@/server/match/friendly";
import { checkIn, defaultDeps, runOnMatch } from "@/server/match/runner";
import { LEAVE_AFTER_MS, START_GRACE_MS, startRound } from "@/server/match/service";
import { MATCHES_TABLE } from "@/server/match/store";
import { answerChallenge, CHALLENGES_TABLE, checkChallenge, incomingChallenges, sendChallenge } from "./challenges";
import { answerFriendRequest, FRIEND_REQUESTS_TABLE, FRIENDSHIPS_TABLE, friendsOverview, sendFriendRequest } from "./friends";

// Live checks of Friends and friendly matches against the Supabase project in
// .env.local: npm run test:supabase. Throwaway accounts are deleted afterwards (their
// requests, friendships, challenges and profiles go with them).

const admin = () => getServerSupabase();
const users: string[] = [];
const matches: string[] = [];
const suffix = String(Date.now()).slice(-6);

async function account(username: string): Promise<string> {
  const { data, error } = await admin().auth.admin.createUser({ email: `it-${crypto.randomUUID()}@example.com`, password: crypto.randomUUID(), email_confirm: true });
  if (error) throw new Error(error.message);
  users.push(data.user.id);
  const insert = await admin().from(PROFILES_TABLE).insert({ user_id: data.user.id, username });
  if (insert.error) throw new Error(insert.error.message);
  return data.user.id;
}

let alice = "";
let bob = "";
let cara = "";
beforeAll(async () => {
  [alice, bob, cara] = await Promise.all([account(`fA_${suffix}`), account(`fB_${suffix}`), account(`fC_${suffix}`)]);
});
afterAll(async () => {
  if (matches.length) await admin().from(MATCHES_TABLE).delete().in("id", matches);
  for (const id of users) await admin().auth.admin.deleteUser(id);
});

describe("friends tables", () => {
  it("run a request through to a friendship", async () => {
    expect(await sendFriendRequest(alice, `fb_${suffix}`, admin())).toMatchObject({ ok: true });
    expect(await sendFriendRequest(alice, `fB_${suffix}`, admin())).toMatchObject({ ok: false }); // one pending per direction
    const { requestId } = (await friendsOverview(bob, admin())).incoming[0];
    expect(await answerFriendRequest(bob, requestId, true, admin())).toMatchObject({ ok: true });
    expect((await friendsOverview(alice, admin())).friends.map((f) => f.username)).toEqual([`fB_${suffix}`]);
  });

  it("keep declined requests out of the way of a new one", async () => {
    expect(await sendFriendRequest(cara, `fA_${suffix}`, admin())).toMatchObject({ ok: true });
    const { requestId } = (await friendsOverview(alice, admin())).incoming[0];
    await answerFriendRequest(alice, requestId, false, admin());
    expect(await sendFriendRequest(cara, `fA_${suffix}`, admin())).toMatchObject({ ok: true });
  });

  it("store each friendship once, in order", async () => {
    const reversed = await admin().from(FRIENDSHIPS_TABLE).insert({ user_a: alice > bob ? alice : bob, user_b: alice > bob ? bob : alice });
    expect(reversed.error?.code).toBe("23514"); // check (user_a < user_b)
  });

  it("are closed to the publishable key", async () => {
    for (const table of [FRIEND_REQUESTS_TABLE, FRIENDSHIPS_TABLE, CHALLENGES_TABLE]) {
      const read = await getPublicSupabase().from(table).select("*").limit(1);
      expect(read.error?.code).toBe("42501");
    }
  });
});

describe("a challenge and its friendly match", () => {
  it("reaches the challenged friend only, makes a friendly match on accept, and leaves ratings alone", async () => {
    const notified: string[] = [];
    const deps = { db: admin(), now: Date.now, notify: async (id: string) => void notified.push(id) };
    const sent = await sendChallenge(alice, "it-friendly-a", `fB_${suffix}`, deps);
    if (!sent.ok) throw new Error(sent.error);
    expect(notified).toEqual([bob]);
    expect((await incomingChallenges(bob, deps)).map((i) => i.from.username)).toEqual([`fA_${suffix}`]);
    expect(await incomingChallenges(cara, deps)).toEqual([]);
    expect(await sendChallenge(cara, "it-friendly-c", `fB_${suffix}`, deps)).toMatchObject({ ok: false }); // not friends

    let now = Date.now();
    const matchDeps = { ...defaultDeps(), now: () => now };
    const answer = await answerChallenge(bob, "it-friendly-b", sent.challengeId, true, { ...deps, createFriendlyMatch: friendlyMatchMaker(matchDeps) });
    if (!("matchId" in answer)) throw new Error(JSON.stringify(answer));
    matches.push(answer.matchId);
    expect(await checkChallenge(alice, sent.challengeId, deps)).toEqual({ status: "accepted", matchId: answer.matchId });

    const { data } = await admin().from(MATCHES_TABLE).select("mode, opponent_kind").eq("id", answer.matchId).single();
    expect(data).toEqual({ mode: "friendly", opponent_kind: "human" });

    // Play it to the end (Bob goes silent, Alice wins): no rating moves, no match counted.
    await runOnMatch(answer.matchId, startRound, matchDeps, "it-friendly-a");
    now += START_GRACE_MS + LEAVE_AFTER_MS + 1_000;
    const over = await checkIn(answer.matchId, "it-friendly-a", matchDeps);
    expect(over).toMatchObject({ match: { status: "over" }, friendly: true, ranked: null });
    const rpc = await admin().rpc("settle_ranked_match", { p_match: answer.matchId, p_result: { a: { delta: 16 }, b: { delta: -16 } } });
    expect(rpc.data).toBeNull(); // the SQL function refuses a friendly match too
    for (const id of [alice, bob]) expect(await getProfile(id, admin())).toMatchObject({ rating: 1200, matchesPlayed: 0 });
  });
});
