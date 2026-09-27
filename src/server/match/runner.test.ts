import { describe, expect, it, vi } from "vitest";
import { seeded } from "@/game/__fixtures__/seeded";
import { fakeSupabase, fakeTable } from "@/test/fakeSupabase";
import { loadSnapshot } from "@/test/snapshot";
import { checkIn, createMatch, MatchAccessError, type MatchDeps, MatchNotFoundError, runOnMatch } from "./runner";
import { buzz, LEAVE_AFTER_MS, START_GRACE_MS, startRound } from "./service";
import { findActiveRealMatch } from "./store";
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
