import { describe, expect, it, vi } from "vitest";
import { seeded } from "@/game/__fixtures__/seeded";
import { fakeSupabase, fakeTable } from "@/test/fakeSupabase";
import { loadSnapshot } from "@/test/snapshot";
import { checkIn, createMatch, MatchAccessError, type MatchDeps, MatchNotFoundError, runOnMatch } from "./runner";
import { abandonSolo, buzz, LEAVE_AFTER_MS, requestRematch, START_GRACE_MS, startRound } from "./service";
import { findActiveRealMatch } from "./store";
import { friendlyMatchMaker } from "./friendly";
import type { RankedResult } from "./ranked";
import type { MatchView } from "./view";

// The runner against an in-memory `matches` table (secret key). No network.

const T0 = 1_750_000_000_000;
const ORIGIN = { opponentKind: "bot" as const, queueEntryId: null, playerSession: "session-1" };

function setup() {
  const table = fakeTable();
  let now = T0;
  const sent: MatchView[] = [];
  const deps: MatchDeps = {
    db: fakeSupabase(table, "secret"),
    now: () => now,
    rng: seeded(5),
    loadPool: async () => loadSnapshot(),
    broadcast: vi.fn(async (view: MatchView) => void sent.push(view)),
    settleRanked: vi.fn(async (_id: string, result: RankedResult) => result),
  };
  return { table, deps, sent, advance: (ms: number) => (now += ms) };
}

describe("match runner", () => {
  it("creates a match row with readable columns and no running round", async () => {
    const { table, deps } = setup();
    const view = await createMatch(deps, "Emre_34", ORIGIN);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toMatchObject({
      id: view.id,
      version: 0,
      status: "playing",
      round_number: 1,
      round_started_at: null,
      player_score: 0,
      bot_score: 0,
      opponent_name: "Emre_34",
      opponent_kind: "bot",
      player_session: "session-1",
    });
    expect(view.round).toBeNull();
    expect(view.opponentName).toBe("Emre_34");
    expect(JSON.stringify(view)).not.toMatch(/opponent_?kind|"human"|session-1/);
  });

  it("saves a change with a new version and broadcasts the new view", async () => {
    const { table, deps, sent } = setup();
    const { id } = await createMatch(deps, "Emre_34", ORIGIN);
    const view = await runOnMatch(id, startRound, deps);
    expect(view.version).toBe(1);
    expect(view.round?.clockMs).toBe(0);
    expect(table.rows[0]).toMatchObject({ version: 1, round_started_at: new Date(T0).toISOString() });
    expect(sent).toEqual([view]);
  });

  it("neither writes nor broadcasts when nothing changes", async () => {
    const { table, deps, sent, advance } = setup();
    const { id } = await createMatch(deps, "Emre_34", ORIGIN);
    await runOnMatch(id, startRound, deps);
    advance(2_000);
    const view = await runOnMatch(id, (r) => ({ record: r, changed: false }), deps);
    expect(view.round?.clockMs).toBe(2_000);
    expect(table.rows[0].version).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("retries when another request wrote first, applying the rule to the fresh row", async () => {
    const { table, deps } = setup();
    const { id } = await createMatch(deps, "Emre_34", ORIGIN);
    await runOnMatch(id, startRound, deps);
    let calls = 0;
    const view = await runOnMatch(
      id,
      (record, clock) => {
        calls += 1;
        // First attempt: someone else bumps the version under us.
        if (calls === 1) table.rows[0].version = (table.rows[0].version as number) + 1;
        return buzz(record, clock);
      },
      deps,
    );
    expect(calls).toBe(2);
    expect(view.version).toBe(3);
    expect(view.round?.player.kind).toBe("answering");
  });

  it("reports a match that does not exist", async () => {
    const { deps } = setup();
    await expect(runOnMatch("00000000-0000-4000-8000-000000000000", startRound, deps)).rejects.toBeInstanceOf(MatchNotFoundError);
  });

  it("still answers when the Realtime broadcast fails", async () => {
    const { deps } = setup();
    const { id } = await createMatch(deps, "Emre_34", ORIGIN);
    deps.broadcast = vi.fn(async () => {
      throw new Error("realtime down");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(runOnMatch(id, startRound, deps)).resolves.toMatchObject({ version: 1 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("realtime down"));
    warn.mockRestore();
  });
});

describe("a match between two real players", () => {
  const PLAYERS = { a: { session: "sa", name: "Emre_34" }, b: { session: "sb", name: "Can2004" }, since: T0 };
  const HUMAN = { opponentKind: "human" as const, queueEntryId: null, playerSession: "sa", opponentSession: "sb" };

  it("broadcasts each seat its own view on its own channel", async () => {
    const { deps, sent } = setup();
    const { id } = await createMatch(deps, "Can2004", HUMAN, PLAYERS);
    await runOnMatch(id, startRound, deps, "sb");
    expect(sent.map((v) => [v.channel, v.opponentName])).toEqual([
      [`match:${id}`, "Can2004"],
      [`match:${id}:b`, "Emre_34"],
    ]);
  });

  it("acts for the caller's seat and answers with their view", async () => {
    const { deps } = setup();
    const { id } = await createMatch(deps, "Can2004", HUMAN, PLAYERS);
    await runOnMatch(id, startRound, deps, "sa");
    const view = await runOnMatch(id, (r, c, seat) => buzz(r, c, seat === "a" ? "player" : "bot"), deps, "sb");
    expect(view.round?.player.kind).toBe("answering"); // seat b sees their own buzz as theirs
  });

  it("refuses a browser that holds neither seat", async () => {
    const { deps } = setup();
    const { id } = await createMatch(deps, "Can2004", HUMAN, PLAYERS);
    await expect(runOnMatch(id, startRound, deps, "someone-else")).rejects.toBeInstanceOf(MatchAccessError);
    await expect(runOnMatch(id, startRound, deps)).rejects.toBeInstanceOf(MatchAccessError);
  });

  it("records presence and ends the match for a seat that went silent", async () => {
    const { deps, table, advance } = setup();
    const { id } = await createMatch(deps, "Can2004", HUMAN, PLAYERS);
    await runOnMatch(id, startRound, deps, "sa");
    expect(await checkIn(id, "sa", deps)).toMatchObject({ match: { status: "playing" } });
    expect(table.rows[0].seat_a_seen_at).toBe(new Date(T0).toISOString());
    advance(START_GRACE_MS + LEAVE_AFTER_MS + 1_000); // seat b never checked in: counted from after the start grace
    const view = await checkIn(id, "sa", deps);
    expect(view).toMatchObject({ endedBecause: "opponent-left", match: { status: "over", winner: "player" } });
  });

  it("has nothing to check in for a bot match", async () => {
    const { deps } = setup();
    const { id } = await createMatch(deps, "Emre_34", ORIGIN);
    expect(await checkIn(id, "session-1", deps)).toBeNull();
  });
});

describe("resuming a real-player match after a reload", () => {
  const PLAYERS = { a: { session: "sa", name: "Emre_34" }, b: { session: "sb", name: "Can2004" }, since: T0 };
  const HUMAN = { opponentKind: "human" as const, queueEntryId: null, playerSession: "sa", opponentSession: "sb" };

  it("finds the running real-player match for either seat, but not a bot match or a finished one", async () => {
    const { table, deps } = setup();
    const bot = await createMatch(deps, "Mateo_37", { ...ORIGIN, playerSession: "sb" });
    const real = await createMatch(deps, "Can2004", HUMAN, PLAYERS);
    for (const row of table.rows) row.created_at = new Date(T0).toISOString();
    expect(await findActiveRealMatch("sa", T0, deps.db)).toBe(real.id);
    expect(await findActiveRealMatch("sb", T0, deps.db)).toBe(real.id);
    expect(await findActiveRealMatch("nobody", T0, deps.db)).toBeNull();
    table.rows.find((r) => r.id === real.id)!.status = "over";
    expect(await findActiveRealMatch("sb", T0, deps.db)).toBeNull();
    expect(bot.id).toBeDefined();
  });
});

describe("a ranked match (§13.5, §14)", () => {
  const PLAYERS = {
    a: { session: "sa", name: "Kadir", account: { userId: "user-a", rating: 1390 } },
    b: { session: "sb", name: "Deniz", account: { userId: "user-b", rating: 1410 } },
    since: T0,
  };
  const RANKED = { opponentKind: "human" as const, queueEntryId: null, playerSession: "sa", opponentSession: "sb", mode: "ranked" as const };

  /** Seat b goes silent, so seat a wins by forfeit: the quickest way to a finished match. */
  async function playToTheEnd(deps: MatchDeps, advance: (ms: number) => number, id: string) {
    await runOnMatch(id, startRound, deps, "sa");
    advance(START_GRACE_MS + LEAVE_AFTER_MS + 1_000);
    return (await checkIn(id, "sa", deps))!;
  }

  it("is stored as ranked and shows both usernames and ratings, never nicknames", async () => {
    const { deps, table } = setup();
    const view = await createMatch(deps, "Deniz", RANKED, PLAYERS);
    expect(table.rows[0]).toMatchObject({ mode: "ranked", opponent_kind: "human" });
    expect(view.ranked).toEqual({
      you: { username: "Kadir", rating: 1390, tier: "Pro" },
      opponent: { username: "Deniz", rating: 1410, tier: "Elite" },
      change: null,
    });
    const forB = await runOnMatch(view.id, startRound, deps, "sb");
    expect(forB.ranked?.you.username).toBe("Deniz");
    expect(forB.ranked?.opponent).toEqual({ username: "Kadir", rating: 1390, tier: "Pro" });
    expect(forB.rematch).toBe("queue");
  });

  it("updates both ratings by Elo once it is over, and tells each player their own change", async () => {
    const { deps, advance, sent } = setup();
    const { id } = await createMatch(deps, "Deniz", RANKED, PLAYERS);
    const view = await playToTheEnd(deps, advance, id);
    expect(view.match.winner).toBe("player");
    expect(deps.settleRanked).toHaveBeenCalledTimes(1);
    expect(deps.settleRanked).toHaveBeenCalledWith(id, {
      a: { before: 1390, after: 1407, delta: 17 },
      b: { before: 1410, after: 1393, delta: -17 },
    });
    // 1390 → 1407 crosses into ELITE: the result screen says rank up.
    expect(view.ranked?.change).toEqual({ before: 1390, after: 1407, delta: 17, tierBefore: "Pro", tierAfter: "Elite" });
    const forB = sent.filter((v) => v.channel.endsWith(":b")).at(-1)!;
    expect(forB.ranked?.change).toEqual({ before: 1410, after: 1393, delta: -17, tierBefore: "Elite", tierAfter: "Pro" });
  });

  it("does not settle again once the result is stored", async () => {
    const { deps, advance, table } = setup();
    const { id } = await createMatch(deps, "Deniz", RANKED, PLAYERS);
    const over = await playToTheEnd(deps, advance, id);
    table.rows[0].ranked_result = { a: over.ranked!.change, b: { before: 1410, after: 1393, delta: -17 } }; // as the SQL function stored it
    await runOnMatch(id, (r) => ({ record: r, changed: false }), deps, "sb");
    expect(deps.settleRanked).toHaveBeenCalledTimes(1);
  });

  it("tries again later if updating the ratings failed", async () => {
    const { deps, advance } = setup();
    const { id } = await createMatch(deps, "Deniz", RANKED, PLAYERS);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(deps.settleRanked).mockRejectedValueOnce(new Error("db down"));
    const over = await playToTheEnd(deps, advance, id);
    expect(over.ranked?.change).toBeNull();
    const later = await runOnMatch(id, (r) => ({ record: r, changed: false }), deps, "sa");
    expect(later.ranked?.change?.delta).toBe(17);
    expect(deps.settleRanked).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("offers no rematch against the same player", async () => {
    const { deps, advance } = setup();
    const { id } = await createMatch(deps, "Deniz", RANKED, PLAYERS);
    await playToTheEnd(deps, advance, id);
    const view = await runOnMatch(id, (r, c, seat) => requestRematch(r, c.now, seat), deps, "sa");
    expect(view.rematchOffer).toBeNull();
  });

  it("leaves Quick Match untouched: no ranked info, no settling", async () => {
    const { deps, advance } = setup();
    const quick = { a: { session: "sa", name: "Emre_34" }, b: { session: "sb", name: "Can2004" }, since: T0 };
    const { id } = await createMatch(deps, "Can2004", { opponentKind: "human", queueEntryId: null, playerSession: "sa", opponentSession: "sb" }, quick);
    const view = await playToTheEnd(deps, advance, id);
    expect(view.ranked).toBeNull();
    expect(view.rematch).toBe("mutual");
    expect(deps.settleRanked).not.toHaveBeenCalled();
  });
});

describe("a friendly match between friends (§13.2)", () => {
  const profile = (userId: string, username: string, rating: number) =>
    ({ userId, username, rating, tier: "Pro", matchesPlayed: 0, matchesWon: 0, matchesLost: 0 }) as const;
  const ALICE = profile("user-a", "Alice", 1250);
  const BOB = profile("user-b", "Bob", 1180);

  it("is made with the challenger in seat a, both named by username, stored as friendly", async () => {
    const { deps, table } = setup();
    const id = await friendlyMatchMaker(deps)({ session: "sa", profile: ALICE }, { session: "sb", profile: BOB });
    expect(table.rows[0]).toMatchObject({ id, mode: "friendly", opponent_kind: "human", player_session: "sa", opponent_session: "sb" });
    const forA = await runOnMatch(id, startRound, deps, "sa");
    expect(forA).toMatchObject({ friendly: true, ranked: null, rematch: "mutual", opponentName: "Bob" });
    expect(forA.accounts).toEqual({ you: { username: "Alice", rating: 1250, tier: "Pro" }, opponent: { username: "Bob", rating: 1180, tier: "Semi-Pro" } });
    const forB = await runOnMatch(id, (r) => ({ record: r, changed: false }), deps, "sb");
    expect(forB.accounts?.you.username).toBe("Bob");
    expect(forB.opponentName).toBe("Alice");
  });

  it("never changes ratings: nothing is settled when it ends", async () => {
    const { deps, advance } = setup();
    const id = await friendlyMatchMaker(deps)({ session: "sa", profile: ALICE }, { session: "sb", profile: BOB });
    await runOnMatch(id, startRound, deps, "sa");
    advance(START_GRACE_MS + LEAVE_AFTER_MS + 1_000);
    const over = await checkIn(id, "sa", deps);
    expect(over).toMatchObject({ match: { status: "over", winner: "player" }, ranked: null, friendly: true });
    await runOnMatch(id, (r) => ({ record: r, changed: false }), deps, "sb");
    expect(deps.settleRanked).not.toHaveBeenCalled();
  });

  it("offers the mutual rematch, as Quick Match does", async () => {
    const { deps, advance } = setup();
    const id = await friendlyMatchMaker(deps)({ session: "sa", profile: ALICE }, { session: "sb", profile: BOB });
    await runOnMatch(id, startRound, deps, "sa");
    advance(START_GRACE_MS + LEAVE_AFTER_MS + 1_000);
    await checkIn(id, "sa", deps);
    const view = await runOnMatch(id, (r, c, seat) => requestRematch(r, c.now, seat), deps, "sa");
    expect(view.rematchOffer).toMatchObject({ you: true, opponent: false });
  });

  it("refuses browsers that hold neither seat", async () => {
    const { deps } = setup();
    const id = await friendlyMatchMaker(deps)({ session: "sa", profile: ALICE }, { session: "sb", profile: BOB });
    await expect(runOnMatch(id, startRound, deps, "someone-else")).rejects.toBeInstanceOf(MatchAccessError);
  });
});

describe("a ranked match the bot took", () => {
  const SOLO = { userId: "user-a", username: "Kadir", rating: 1300, opponentRating: 1262 };
  const ORIGIN_RANKED_BOT = { opponentKind: "bot" as const, queueEntryId: "q-1", playerSession: "sa", mode: "ranked" as const };

  it("is stored as a ranked bot match, and shows the bot like any ranked player", async () => {
    const { deps, table } = setup();
    const view = await createMatch(deps, "Oğuz1989", ORIGIN_RANKED_BOT, null, SOLO);
    expect(table.rows[0]).toMatchObject({ mode: "ranked", opponent_kind: "bot", ranked_solo: SOLO });
    expect(view.ranked).toEqual({
      you: { username: "Kadir", rating: 1300, tier: "Pro" },
      opponent: { username: "Oğuz1989", rating: 1262, tier: "Pro" },
      change: null,
    });
    expect(view.rematch).toBe("queue");
    // Nothing in what the browser gets says who really played.
    expect(JSON.stringify(view)).not.toMatch(/opponent_?kind|ranked_?solo|user-a|"human"/);
  });

  it("updates only the player, by Elo against the ghost rating, when it ends", async () => {
    const { deps } = setup();
    const { id } = await createMatch(deps, "Oğuz1989", ORIGIN_RANKED_BOT, null, SOLO);
    await runOnMatch(id, startRound, deps, "sa");
    const over = await runOnMatch(id, abandonSolo, deps, "sa"); // the quickest way to the end: a loss
    // 1300 vs 1262, a loss: round(32 × 0.5545) = 18.
    expect(deps.settleRanked).toHaveBeenCalledWith(id, { a: { before: 1300, after: 1282, delta: -18 }, b: { before: 1262, after: 1280, delta: 18 } });
    expect(over.ranked?.change).toEqual({ before: 1300, after: 1282, delta: -18, tierBefore: "Pro", tierAfter: "Pro" });
    expect(over.endedBecause).toBe("you-left");
  });

  it("leaves Quick Match bot matches alone", async () => {
    const { deps } = setup();
    const { id } = await createMatch(deps, "Emre_34", ORIGIN);
    const view = await runOnMatch(id, abandonSolo, deps);
    expect(view.match.status).toBe("playing");
    expect(view.ranked).toBeNull();
    expect(deps.settleRanked).not.toHaveBeenCalled();
  });
});
