import "server-only";
import { buildSchedule } from "@/game/match";
import type { Rng } from "@/game/bot";
import type { Puzzle } from "@/game/types";
import { fetchPublishedPuzzles } from "@/data/puzzles";
import { getServerSupabase } from "@/lib/supabase/server";
import { broadcastMatchView } from "./broadcast";
import { needsSettling, rankedResult, type RankedResult } from "./ranked";
import { type Clock, forfeitIfGone, type MatchRecord, newMatchRecord, type Outcome, type Players, type RankedSolo, type Seat } from "./service";
import { insertMatch, loadMatchWithPresence, type MatchOrigin, saveMatch, settleRankedMatch, type Db, touchSeat } from "./store";
import { toView, type MatchView } from "./view";

// Runs a match rule against the stored match: load → apply (./service.ts) → save
// with a version check → broadcast the new view over Realtime. Used by the Server
// Functions in src/app/match/actions.ts.

export interface MatchDeps {
  db: Db;
  now: () => number;
  rng: Rng;
  loadPool: () => Promise<Puzzle[]>;
  broadcast: (view: MatchView) => Promise<void>;
  /** Applies a finished ranked match to both profiles, once (./store.ts settleRankedMatch). */
  settleRanked: (matchId: string, result: RankedResult) => Promise<RankedResult | null>;
}

export function defaultDeps(): MatchDeps {
  const server = getServerSupabase();
  return {
    db: server,
    now: Date.now,
    rng: Math.random,
    loadPool: () => fetchPublishedPuzzles(),
    broadcast: (view) => broadcastMatchView(view, server),
    settleRanked: (matchId, result) => settleRankedMatch(matchId, result, server),
  };
}

/** A real-player match refuses a browser that holds neither seat. */
export class MatchAccessError extends Error {
  constructor() {
    super("This match belongs to other players");
    this.name = "MatchAccessError";
  }
}

/**
 * The caller's seat. A bot match has one player and is guarded by its unguessable id,
 * as before; a real-player match checks the session cookie against both seats.
 */
function seatOf(record: MatchRecord, session: string | undefined): Seat {
  const players = record.players;
  if (!players) return "a";
  if (session && session === players.a.session) return "a";
  if (session && session === players.b.session) return "b";
  throw new MatchAccessError();
}

export class MatchNotFoundError extends Error {
  constructor(id: string) {
    super(`Match ${id} does not exist`);
    this.name = "MatchNotFoundError";
  }
}

/** Two requests for one match wrote at once this many times in a row: give up. */
const MAX_ATTEMPTS = 4;

/** Every seat gets the match as it sees it, on its own channel. */
async function publish(record: MatchRecord, now: number, deps: MatchDeps, seen?: Record<Seat, number | null>): Promise<void> {
  const seats: Seat[] = record.players ? ["a", "b"] : ["a"];
  await Promise.all(
    seats.map(async (seat) => {
      try {
        await deps.broadcast(toView(record, now, seat, seen));
      } catch (e) {
        // The caller still gets the view in its response; listeners catch up on the next change.
        console.warn(`Realtime broadcast for match ${record.id} failed: ${(e as Error).message}`);
      }
    }),
  );
}

/**
 * A ranked match that has just ended (or whose settling failed before): its rating
 * changes go to both profiles, and the record carries them for the result screen.
 * A failure here leaves the match as it is; the next request for it tries again.
 */
async function settleIfDue(record: MatchRecord, deps: MatchDeps): Promise<MatchRecord> {
  if (!needsSettling(record)) return record;
  try {
    const stored = await deps.settleRanked(record.id, rankedResult(record)!);
    return { ...record, rankedResult: stored };
  } catch (e) {
    console.warn(`Ratings for match ${record.id} were not updated yet: ${(e as Error).message}`);
    return record;
  }
}

/**
 * A new match: the server draws the five puzzles (§27). The first round starts on
 * startRound. `origin` is stored for statistics and never reaches the view.
 */
export async function createMatch(
  deps: MatchDeps,
  opponentName: string,
  origin: MatchOrigin,
  players: Players | null = null,
  rankedSolo: RankedSolo | null = null,
): Promise<MatchView> {
  const schedule = buildSchedule(await deps.loadPool(), deps.rng);
  const record: MatchRecord = {
    id: crypto.randomUUID(),
    mode: origin.mode ?? "quick",
    ...newMatchRecord(schedule, opponentName, players),
    rankedSolo,
  };
  const now = deps.now();
  await insertMatch(record, origin, now, deps.db);
  return toView(record, now);
}

/**
 * Runs `rule` for the caller (identified by `session` in a real-player match) and
 * returns the match as the caller sees it.
 */
export async function runOnMatch(
  id: string,
  rule: (record: MatchRecord, clock: Clock, seat: Seat) => Outcome | Promise<Outcome>,
  deps: MatchDeps,
  session?: string,
): Promise<MatchView> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const loaded = await loadMatchWithPresence(id, deps.db);
    if (!loaded) throw new MatchNotFoundError(id);
    const stored = loaded.record;
    const seat = seatOf(stored, session);
    const clock: Clock = { now: deps.now(), rng: deps.rng };
    const { record, changed } = await rule(stored, clock, seat);
    if (!changed) return toView(await settleIfDue(stored, deps), clock.now, seat, loaded.seen);

    const next = { ...record, version: stored.version + 1 };
    if (await saveMatch(next, stored.version, clock.now, deps.db)) {
      const settled = await settleIfDue(next, deps);
      await publish(settled, clock.now, deps, loaded.seen);
      return toView(settled, clock.now, seat, loaded.seen);
    }
  }
  throw new Error(`Match ${id} is changing too fast; try again.`);
}

/**
 * A player's browser checks in (every few seconds, from the match screen). In a
 * real-player match this records their presence and ends the match for a seat that
 * has gone silent (forfeitIfGone). A bot match has nothing to record.
 */
export async function checkIn(id: string, session: string, deps: MatchDeps): Promise<MatchView | null> {
  const loaded = await loadMatchWithPresence(id, deps.db);
  if (!loaded) throw new MatchNotFoundError(id);
  if (!loaded.record.players) return null;
  const seat = seatOf(loaded.record, session);
  const now = deps.now();
  await touchSeat(id, seat, now, deps.db);
  const seen = { ...loaded.seen, [seat]: now };
  return runOnMatch(id, (record) => forfeitIfGone(record, deps.now(), seat, seen), deps, session);
}

/** The current view of a match, without changing it. */
export async function viewMatch(id: string, deps: MatchDeps, session?: string): Promise<MatchView> {
  return runOnMatch(id, (record) => ({ record, changed: false }), deps, session);
}
