import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MATCH_STATE_EVENT, matchChannel } from "@/lib/matchChannel";
import { getPublicSupabase } from "@/lib/supabase/public";
import { getServerSupabase } from "@/lib/supabase/server";
import { broadcastMatchView } from "./broadcast";
import { QUEUE_TABLE, supabaseQueueStore } from "./queueStore";
import { createMatch, defaultDeps, runOnMatch } from "./runner";
import { buzz, startRound } from "./service";
import { MATCHES_TABLE } from "./store";
import type { MatchView } from "./view";

// Live checks of the server-authoritative match (GDD §27) against the Supabase project
// in .env.local: npm run test:supabase. The matches made here are deleted afterwards.

const created: string[] = [];
afterAll(async () => {
  if (created.length) await getServerSupabase().from(MATCHES_TABLE).delete().in("id", created);
});

describe("matches table", () => {
  it("runs a match on the server: create, start the round, buzz", async () => {
    const deps = defaultDeps();
    const view = await createMatch(deps, "Emre_34", { opponentKind: "bot", queueEntryId: null, playerSession: null });
    created.push(view.id);
    expect(view.match.current.correct_answer).toBe("");

    const started = await runOnMatch(view.id, startRound, deps);
    expect(started.round?.clockMs).toBeLessThan(1_000);
    const buzzed = await runOnMatch(view.id, (r, c) => buzz(r, c), deps);
    expect(buzzed.round?.player.kind).toBe("answering");

    const { data } = await getServerSupabase().from(MATCHES_TABLE).select("*").eq("id", view.id).single();
    expect(data).toMatchObject({ version: 2, status: "playing", round_number: 1, current_puzzle_id: view.match.current.id });
    expect(data.round_started_at).not.toBeNull();
    expect(data.player_buzz_ms).toBeGreaterThanOrEqual(0);
    expect(data.round.botPlan).toBeDefined(); // kept on the server...
    expect(JSON.stringify(buzzed)).not.toContain("botPlan"); // ...never in the view
  });

  it("is closed to the publishable key: no reading, no writing", async () => {
    const anon = getPublicSupabase().from(MATCHES_TABLE);
    const read = await anon.select("id").limit(1);
    const write = await anon.insert({ status: "playing", round_number: 1, current_puzzle_id: "x", state: {} });
    expect(read.error?.code).toBe("42501");
    expect(write.error?.code).toBe("42501");
  });
});

describe("Realtime", () => {
  it("delivers a server broadcast to a browser-side listener on the match channel", async () => {
    const id = crypto.randomUUID();
    const db = getPublicSupabase();
    const received = new Promise<MatchView>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no broadcast within 10 s")), 10_000);
      const channel = db
        .channel(matchChannel(id))
        .on("broadcast", { event: MATCH_STATE_EVENT }, ({ payload }) => {
          clearTimeout(timer);
          void db.removeChannel(channel);
          resolve(payload as MatchView);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await broadcastMatchView({ id, version: 7, channel: matchChannel(id) } as MatchView, getServerSupabase());
          }
        });
    });
    expect(await received).toMatchObject({ id, version: 7 });
  });
});

describe("match_queue (claim_queue_partner)", () => {
  const entries: string[] = [];
  const store = () => supabaseQueueStore(getServerSupabase());
  const join = async (session: string) => {
    const entry = await store().insert(session, Date.now() + 20_000, "Player_0001");
    entries.push(entry.id);
    await store().touch(entry.id); // its screen polled once: now it can be paired
    return entry;
  };
  afterAll(async () => {
    if (entries.length) await getServerSupabase().from(QUEUE_TABLE).delete().in("id", entries);
  });
  // Each test starts with no waiting entries of ours: a leftover would be a valid partner.
  beforeEach(async () => {
    if (entries.length) await getServerSupabase().from(QUEUE_TABLE).update({ status: "abandoned" }).in("id", entries).eq("status", "waiting");
  });

  it("pairs two fresh waiting players, both rows at once", async () => {
    const a = await join("it-session-a");
    const b = await join("it-session-b");
    expect(await store().claimPartner(b.id, 5)).toBe(a.id);
    expect(await store().get(a.id)).toMatchObject({ status: "paired", pairedWith: b.id });
    expect(await store().get(b.id)).toMatchObject({ status: "paired", pairedWith: a.id });
  });

  it("never pairs a session with itself", async () => {
    const first = await join("it-session-same");
    const second = await join("it-session-same");
    expect(await store().claimPartner(second.id, 5)).toBeNull();
    expect((await store().get(first.id))?.status).toBe("waiting");
  });

  it("never pairs with a search whose screen has not polled yet", async () => {
    const entry = await store().insert("it-session-new", Date.now() + 20_000, "Player_0001");
    entries.push(entry.id);
    const other = await join("it-session-other");
    expect(await store().claimPartner(other.id, 5)).toBeNull();
  });

  it("skips a player whose screen stopped polling", async () => {
    const stale = await join("it-session-stale");
    await getServerSupabase().from(QUEUE_TABLE).update({ last_seen_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", stale.id);
    const fresh = await join("it-session-fresh");
    expect(await store().claimPartner(fresh.id, 5)).toBeNull();
  });

  it("is closed to the publishable key", async () => {
    const read = await getPublicSupabase().from(QUEUE_TABLE).select("id").limit(1);
    const rpc = await getPublicSupabase().rpc("claim_queue_partner", { p_entry: crypto.randomUUID(), p_fresh_seconds: 5 });
    expect(read.error?.code).toBe("42501");
    expect(rpc.error).not.toBeNull();
  });
});

describe("a match between two real players", () => {
  it("delivers seat a's buzz to seat b on seat b's own channel, as seat b sees it", async () => {
    const deps = defaultDeps();
    const players = { a: { session: "it-seat-a", name: "Emre_34" }, b: { session: "it-seat-b", name: "Can2004" }, since: Date.now() };
    const view = await createMatch(deps, "Can2004", { opponentKind: "human", queueEntryId: null, playerSession: "it-seat-a", opponentSession: "it-seat-b" }, players);
    created.push(view.id);
    await runOnMatch(view.id, startRound, deps, "it-seat-a");

    const db = getPublicSupabase();
    const seenByB = new Promise<MatchView>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("seat b heard nothing within 10 s")), 10_000);
      const channel = db
        .channel(matchChannel(view.id, "b"))
        .on("broadcast", { event: MATCH_STATE_EVENT }, ({ payload }) => {
          clearTimeout(timer);
          void db.removeChannel(channel);
          resolve(payload as MatchView);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") await runOnMatch(view.id, (r, c) => buzz(r, c, "player"), deps, "it-seat-a");
        });
    });
    const b = await seenByB;
    expect(b.opponentName).toBe("Emre_34");
    expect(b.round?.bot.kind).toBe("answering"); // seat a, the opponent from b's side, is answering
    expect(b.round?.player.kind).toBe("waiting");
  });
});
