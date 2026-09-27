import { describe, expect, it, vi } from "vitest";
import { seeded } from "@/game/__fixtures__/seeded";
import {
  FRESH_SECONDS,
  HANDOFF_MS,
  joinQueue,
  joinRankedQueue,
  leaveQueue,
  pollQueue,
  QueueAccessError,
  RANKED_SEARCH_MAX_MS,
  RANKED_SEARCH_MIN_MS,
  type QueueDeps,
  type QueueEntry,
  type QueueStore,
  SEARCH_MAX_MS,
  SEARCH_MIN_MS,
} from "./queue";
import type { MatchView } from "./view";

// The Quick Match queue over an in-memory store that follows the same rules as the
// claim_queue_partner SQL function (the live version is match.integration.test.ts).

function memoryStore(clock: { now: number }) {
  const rows = new Map<string, QueueEntry & { lastSeen: number; createdAt: number }>();
  let n = 0;
  const store: QueueStore = {
    async insert(sessionId, searchUntil, nickname, userId) {
      const entry: QueueEntry = {
        id: `q${++n}`,
        sessionId,
        status: "waiting",
        searchUntil,
        pairedWith: null,
        matchId: null,
        resolvedAt: null,
        nickname,
        mode: userId ? "ranked" : "quick",
        userId: userId ?? null,
      };
      rows.set(entry.id, { ...entry, lastSeen: -Infinity, createdAt: clock.now + n }); // fresh once it polls, like the table
      return entry;
    },
    async get(id) {
      const row = rows.get(id);
      if (!row) return null;
      const entry: Partial<typeof row> = { ...row };
      delete entry.lastSeen;
      delete entry.createdAt;
      return entry as QueueEntry;
    },
    async touch(id) {
      rows.get(id)!.lastSeen = clock.now;
    },
    async claimPartner(id, freshSeconds) {
      const me = rows.get(id);
      if (!me || me.status !== "waiting") return null;
      const partner = [...rows.values()]
        .filter((r) => r.status === "waiting" && r.id !== id && r.sessionId !== me.sessionId)
        .filter((r) => r.mode === me.mode && (me.userId === null || r.userId !== me.userId))
        .filter((r) => r.lastSeen > clock.now - freshSeconds * 1000 && r.searchUntil > clock.now)
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!partner) return null;
      Object.assign(me, { status: "paired", pairedWith: partner.id, resolvedAt: clock.now });
      Object.assign(partner, { status: "paired", pairedWith: id, resolvedAt: clock.now });
      return partner.id;
    },
    async resolve(id, status) {
      const row = rows.get(id)!;
      if (row.status !== "waiting") return false;
      row.status = status;
      row.resolvedAt = clock.now;
      return true;
    },
    async setMatch(id, matchId) {
      const row = rows.get(id)!;
      if (row.matchId) return false;
      row.matchId = matchId;
      return true;
    },
  };
  return { store, rows };
}

function setup() {
  const clock = { now: 1_750_000_000_000 };
  const { store, rows } = memoryStore(clock);
  const created: { opponentName: string; queueEntryId: string }[] = [];
  const realMatches: { a: string; b: string; names: [string, string]; mode: string; users: [string | null, string | null] }[] = [];
  const rankedBots: { opponentName: string; entryId: string; userId: string | null }[] = [];
  const deps: QueueDeps = {
    store,
    now: () => clock.now,
    rng: seeded(4),
    createMatch: vi.fn(async (opponentName, queueEntryId) => {
      created.push({ opponentName, queueEntryId });
      return { id: `m-${queueEntryId}`, opponentName } as MatchView;
    }),
    createRealMatch: vi.fn(async (a, b, mode) => {
      realMatches.push({ a: a.sessionId, b: b.sessionId, names: [a.name, b.name], mode, users: [a.userId, b.userId] });
      return { id: `real-${realMatches.length}`, opponentName: b.name } as MatchView;
    }),
    createRankedBotMatch: vi.fn(async (opponentName, entry) => {
      rankedBots.push({ opponentName, entryId: entry.id, userId: entry.userId });
      return { id: `rb-${entry.id}`, opponentName } as MatchView;
    }),
    viewMatch: vi.fn(async (matchId) => ({ id: matchId }) as MatchView),
  };
  return { deps, rows, created, realMatches, rankedBots, wait: (ms: number) => (clock.now += ms) };
}

describe("Quick Match queue", () => {
  it("searches for a random 5-10 s", async () => {
    expect([SEARCH_MIN_MS, SEARCH_MAX_MS]).toEqual([5_000, 10_000]);
    const { deps } = setup();
    const windows = await Promise.all(
      Array.from({ length: 50 }, async () => (await joinQueue("s", "S_1", deps)).searchUntil - deps.now()),
    );
    expect(Math.min(...windows)).toBeGreaterThanOrEqual(SEARCH_MIN_MS);
    expect(Math.max(...windows)).toBeLessThanOrEqual(SEARCH_MAX_MS);
    expect(new Set(windows).size).toBeGreaterThan(10);
  });

  it("keeps searching until the window closes, then gives the match to the bot under a nickname", async () => {
    const { deps, rows, created, wait } = setup();
    const entry = await joinQueue("alice", "Alice_1", deps);
    for (let t = 0; t < SEARCH_MIN_MS - 1_000; t += 1_500) {
      wait(1_500);
      expect(await pollQueue(entry.id, "alice", deps)).toEqual({ status: "searching" });
    }
    wait(SEARCH_MAX_MS);
    const result = await pollQueue(entry.id, "alice", deps);
    expect(result.status).toBe("found");
    expect(rows.get(entry.id)).toMatchObject({ status: "timed_out", matchId: `m-${entry.id}` });
    expect(created).toHaveLength(1);
    expect(created[0].opponentName).not.toMatch(/bot/i);
  });

  it("hands back the same match on a repeated poll", async () => {
    const { deps, created, wait } = setup();
    const entry = await joinQueue("alice", "Alice_1", deps);
    wait(SEARCH_MAX_MS + 1);
    const first = await pollQueue(entry.id, "alice", deps);
    const again = await pollQueue(entry.id, "alice", deps);
    expect(again).toEqual({ status: "found", view: { id: (first as { view: MatchView }).view.id } });
    expect(created).toHaveLength(1);
  });

  it("pairs two players who search at the same time into ONE match against each other", async () => {
    const { deps, rows, created, realMatches, wait } = setup();
    const a = await joinQueue("alice", "Alice_1", deps);
    expect(await pollQueue(a.id, "alice", deps)).toEqual({ status: "searching" });
    wait(500);
    const b = await joinQueue("bob", "Bob_2", deps);
    // Bob's poll pairs them; Alice's entry (the smaller id) builds the match, Bob waits for it.
    expect(await pollQueue(b.id, "bob", deps)).toEqual({ status: "searching" });
    expect(rows.get(a.id)).toMatchObject({ status: "paired", pairedWith: b.id });
    expect(rows.get(b.id)).toMatchObject({ status: "paired", pairedWith: a.id });

    const forAlice = await pollQueue(a.id, "alice", deps);
    const forBob = await pollQueue(b.id, "bob", deps);
    expect(forAlice).toMatchObject({ status: "found", view: { id: "real-1" } });
    expect(forBob).toMatchObject({ status: "found", view: { id: "real-1" } });
    expect(realMatches).toEqual([{ a: "alice", b: "bob", names: ["Alice_1", "Bob_2"], mode: "quick", users: [null, null] }]); // their own nicknames
    expect(created).toEqual([]); // no bot match for either
    expect([rows.get(a.id)?.matchId, rows.get(b.id)?.matchId]).toEqual(["real-1", "real-1"]);
  });

  it("falls back to the bot if the shared match never arrives", async () => {
    const { deps, created, realMatches, wait } = setup();
    const a = await joinQueue("alice", "Alice_1", deps); // pairs, then Alice's tab closes before she builds the match
    await pollQueue(a.id, "alice", deps);
    const b = await joinQueue("bob", "Bob_2", deps);
    expect(await pollQueue(b.id, "bob", deps)).toEqual({ status: "searching" });
    wait(HANDOFF_MS - 1_000);
    expect(await pollQueue(b.id, "bob", deps)).toEqual({ status: "searching" });
    wait(2_000);
    expect((await pollQueue(b.id, "bob", deps)).status).toBe("found");
    expect(realMatches).toEqual([]);
    expect(created).toHaveLength(1);
  });

  it("never pairs anyone with a search whose screen never polled (a dropped search)", async () => {
    const { deps, rows, realMatches } = setup();
    const ghost = await joinQueue("alice", "Alice_1", deps); // e.g. React ran the effect twice and dropped this one
    const b = await joinQueue("bob", "Bob_2", deps);
    expect(await pollQueue(b.id, "bob", deps)).toEqual({ status: "searching" });
    expect(rows.get(ghost.id)?.status).toBe("waiting");
    expect(realMatches).toEqual([]);
  });

  it("never pairs a player with their own other tab", async () => {
    const { deps, rows } = setup();
    const a = await joinQueue("alice", "Alice_1", deps);
    const b = await joinQueue("alice", "Alice_1", deps);
    expect(await pollQueue(b.id, "alice", deps)).toEqual({ status: "searching" });
    expect(rows.get(a.id)?.status).toBe("waiting");
  });

  it("skips a player whose screen stopped polling (tab closed)", async () => {
    const { deps, rows, wait } = setup();
    const gone = await joinQueue("alice", "Alice_1", deps);
    // Still inside their search window, so only the missing polls can rule them out.
    rows.get(gone.id)!.searchUntil = deps.now() + 60_000;
    wait((FRESH_SECONDS + 1) * 1000);
    const b = await joinQueue("bob", "Bob_2", deps);
    expect(await pollQueue(b.id, "bob", deps)).toEqual({ status: "searching" });
    expect(rows.get(gone.id)?.status).toBe("waiting");
  });

  it("does not pair a player who left", async () => {
    const { deps, rows } = setup();
    const a = await joinQueue("alice", "Alice_1", deps);
    await leaveQueue(a.id, "alice", deps);
    const b = await joinQueue("bob", "Bob_2", deps);
    expect(await pollQueue(b.id, "bob", deps)).toEqual({ status: "searching" });
    expect(rows.get(a.id)?.status).toBe("abandoned");
    expect(await pollQueue(a.id, "alice", deps)).toEqual({ status: "gone" });
  });

  it("lets only the browser that joined poll or leave its entry", async () => {
    const { deps } = setup();
    const a = await joinQueue("alice", "Alice_1", deps);
    await expect(pollQueue(a.id, "mallory", deps)).rejects.toBeInstanceOf(QueueAccessError);
    await expect(leaveQueue(a.id, "mallory", deps)).rejects.toBeInstanceOf(QueueAccessError);
    await expect(pollQueue("nope", "alice", deps)).rejects.toBeInstanceOf(QueueAccessError);
  });
});

describe("Ranked queue (§13.5)", () => {
  const ALICE = { userId: "user-alice", username: "Alice" };
  const BOB = { userId: "user-bob", username: "Bob" };

  it("pairs two ranked players into one ranked match, by username and account", async () => {
    const { deps, rows, created, realMatches, wait } = setup();
    const a = await joinRankedQueue("alice", ALICE, deps);
    wait(500);
    const b = await joinRankedQueue("bob", BOB, deps);
    expect(rows.get(a.id)).toMatchObject({ mode: "ranked", userId: "user-alice", nickname: "Alice" });
    expect(await pollQueue(b.id, "bob", deps)).toEqual({ status: "searching" });
    expect(await pollQueue(a.id, "alice", deps)).toMatchObject({ status: "found", view: { id: "real-1" } });
    expect(await pollQueue(b.id, "bob", deps)).toMatchObject({ status: "found", view: { id: "real-1" } });
    expect(realMatches).toEqual([{ a: "alice", b: "bob", names: ["Alice", "Bob"], mode: "ranked", users: ["user-alice", "user-bob"] }]);
    expect(created).toEqual([]);
  });

  it("searches for a random 9-12 s", async () => {
    expect([RANKED_SEARCH_MIN_MS, RANKED_SEARCH_MAX_MS]).toEqual([9_000, 12_000]);
    const { deps } = setup();
    const windows = await Promise.all(
      Array.from({ length: 50 }, async () => (await joinRankedQueue("s", ALICE, deps)).searchUntil - deps.now()),
    );
    expect(Math.min(...windows)).toBeGreaterThanOrEqual(RANKED_SEARCH_MIN_MS);
    expect(Math.max(...windows)).toBeLessThanOrEqual(RANKED_SEARCH_MAX_MS);
  });

  it("gives the match to the bot, for this account, once nobody turned up in time", async () => {
    const { deps, rows, created, rankedBots, wait } = setup();
    const a = await joinRankedQueue("alice", ALICE, deps);
    wait(RANKED_SEARCH_MIN_MS - 1);
    expect(await pollQueue(a.id, "alice", deps)).toEqual({ status: "searching" });
    wait(RANKED_SEARCH_MAX_MS);
    expect(await pollQueue(a.id, "alice", deps)).toMatchObject({ status: "found", view: { id: `rb-${a.id}` } });
    expect(await pollQueue(a.id, "alice", deps)).toMatchObject({ status: "found", view: { id: `rb-${a.id}` } }); // the same one again
    expect(rows.get(a.id)).toMatchObject({ status: "timed_out", matchId: `rb-${a.id}` });
    expect(rankedBots).toEqual([{ opponentName: expect.stringMatching(/^[\p{L}\p{N}_]{3,16}$/u), entryId: a.id, userId: "user-alice" }]);
    expect(rankedBots[0].opponentName).not.toMatch(/bot/i);
    expect(created).toEqual([]); // not a Quick Match bot match
  });

  it("says no-opponent only when even the bot's match cannot be made", async () => {
    const { deps, wait } = setup();
    vi.mocked(deps.createRankedBotMatch).mockRejectedValueOnce(new Error("database down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await joinRankedQueue("alice", ALICE, deps);
    wait(RANKED_SEARCH_MAX_MS + 1);
    expect(await pollQueue(a.id, "alice", deps)).toEqual({ status: "no-opponent" });
    warn.mockRestore();
  });

  it("keeps the lanes apart: a ranked and a Quick Match player searching together are never paired", async () => {
    const { deps, rows, created, realMatches, rankedBots, wait } = setup();
    const ranked = await joinRankedQueue("alice", ALICE, deps);
    const quick = await joinQueue("bob", "Bob_2", deps);
    expect(await pollQueue(quick.id, "bob", deps)).toEqual({ status: "searching" });
    expect(await pollQueue(ranked.id, "alice", deps)).toEqual({ status: "searching" });
    expect([rows.get(ranked.id)?.status, rows.get(quick.id)?.status]).toEqual(["waiting", "waiting"]);

    wait(RANKED_SEARCH_MAX_MS + 1);
    expect((await pollQueue(ranked.id, "alice", deps)).status).toBe("found"); // each gets its own lane's bot
    expect((await pollQueue(quick.id, "bob", deps)).status).toBe("found");
    expect(created).toEqual([{ opponentName: expect.any(String), queueEntryId: quick.id }]);
    expect(rankedBots.map((b) => b.entryId)).toEqual([ranked.id]);
    expect(realMatches).toEqual([]);
  });

  it("never pairs an account with itself on another browser", async () => {
    const { deps, rows } = setup();
    const a = await joinRankedQueue("laptop", ALICE, deps);
    await pollQueue(a.id, "laptop", deps);
    const b = await joinRankedQueue("phone", ALICE, deps);
    expect(await pollQueue(b.id, "phone", deps)).toEqual({ status: "searching" });
    expect(rows.get(a.id)?.status).toBe("waiting");
  });

  it("falls back to the ranked bot when the shared ranked match never arrives", async () => {
    const { deps, created, rankedBots, wait } = setup();
    const a = await joinRankedQueue("alice", ALICE, deps); // pairs, then Alice's tab closes
    await pollQueue(a.id, "alice", deps);
    const b = await joinRankedQueue("bob", BOB, deps);
    expect(await pollQueue(b.id, "bob", deps)).toEqual({ status: "searching" });
    wait(HANDOFF_MS + 1);
    expect((await pollQueue(b.id, "bob", deps)).status).toBe("found");
    expect(rankedBots.map((r) => r.userId)).toEqual(["user-bob"]);
    expect(created).toEqual([]);
  });
});
