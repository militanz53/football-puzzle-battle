import { describe, expect, it, vi } from "vitest";
import { seeded } from "@/game/__fixtures__/seeded";
import { fakeSupabase, fakeTable } from "@/test/fakeSupabase";
import { loadSnapshot } from "@/test/snapshot";
import { createMatch, type MatchDeps, MatchNotFoundError, runOnMatch } from "./runner";
import { buzz, startRound } from "./service";
import type { MatchView } from "./view";

// The runner against an in-memory `matches` table (secret key). No network.

const T0 = 1_750_000_000_000;

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
    const view = await createMatch(deps);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toMatchObject({
      id: view.id,
      version: 0,
      status: "playing",
      round_number: 1,
      round_started_at: null,
      player_score: 0,
      bot_score: 0,
    });
    expect(view.round).toBeNull();
  });

  it("saves a change with a new version and broadcasts the new view", async () => {
    const { table, deps, sent } = setup();
    const { id } = await createMatch(deps);
    const view = await runOnMatch(id, startRound, deps);
    expect(view.version).toBe(1);
    expect(view.round?.clockMs).toBe(0);
    expect(table.rows[0]).toMatchObject({ version: 1, round_started_at: new Date(T0).toISOString() });
    expect(sent).toEqual([view]);
  });

  it("neither writes nor broadcasts when nothing changes", async () => {
    const { table, deps, sent, advance } = setup();
    const { id } = await createMatch(deps);
    await runOnMatch(id, startRound, deps);
    advance(2_000);
    const view = await runOnMatch(id, (r) => ({ record: r, changed: false }), deps);
    expect(view.round?.clockMs).toBe(2_000);
    expect(table.rows[0].version).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("retries when another request wrote first, applying the rule to the fresh row", async () => {
    const { table, deps } = setup();
    const { id } = await createMatch(deps);
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
    const { id } = await createMatch(deps);
    deps.broadcast = vi.fn(async () => {
      throw new Error("realtime down");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(runOnMatch(id, startRound, deps)).resolves.toMatchObject({ version: 1 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("realtime down"));
    warn.mockRestore();
  });
});
