import { afterAll, describe, expect, it } from "vitest";
import { MATCH_STATE_EVENT, matchChannel } from "@/lib/matchChannel";
import { getPublicSupabase } from "@/lib/supabase/public";
import { getServerSupabase } from "@/lib/supabase/server";
import { broadcastMatchView } from "./broadcast";
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
    const view = await createMatch(deps);
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
            await broadcastMatchView({ id, version: 7 } as MatchView, getServerSupabase());
          }
        });
    });
    expect(await received).toMatchObject({ id, version: 7 });
  });
});
