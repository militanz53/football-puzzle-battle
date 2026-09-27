import "server-only";
import { buildSchedule } from "@/game/match";
import type { Rng } from "@/game/bot";
import type { Puzzle } from "@/game/types";
import { fetchPublishedPuzzles } from "@/data/puzzles";
import { getServerSupabase } from "@/lib/supabase/server";
import { broadcastMatchView } from "./broadcast";
import { type Clock, type MatchRecord, newMatchRecord, type Outcome } from "./service";
import { insertMatch, loadMatch, saveMatch, type Db } from "./store";
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
}

export function defaultDeps(): MatchDeps {
  const server = getServerSupabase();
  return {
    db: server,
    now: Date.now,
    rng: Math.random,
    loadPool: () => fetchPublishedPuzzles(),
    broadcast: (view) => broadcastMatchView(view, server),
  };
}

export class MatchNotFoundError extends Error {
  constructor(id: string) {
    super(`Match ${id} does not exist`);
    this.name = "MatchNotFoundError";
  }
}

/** Two requests for one match wrote at once this many times in a row: give up. */
const MAX_ATTEMPTS = 4;

async function publish(view: MatchView, deps: MatchDeps): Promise<void> {
  try {
    await deps.broadcast(view);
  } catch (e) {
    // The caller still gets the view in its response; listeners catch up on the next change.
    console.warn(`Realtime broadcast for match ${view.id} failed: ${(e as Error).message}`);
  }
}

/** A new match: the server draws the five puzzles (§27). The first round starts on startRound. */
export async function createMatch(deps: MatchDeps): Promise<MatchView> {
  const record: MatchRecord = { id: crypto.randomUUID(), ...newMatchRecord(buildSchedule(await deps.loadPool(), deps.rng)) };
  const now = deps.now();
  await insertMatch(record, now, deps.db);
  return toView(record, now);
}

export async function runOnMatch(
  id: string,
  rule: (record: MatchRecord, clock: Clock) => Outcome | Promise<Outcome>,
  deps: MatchDeps,
): Promise<MatchView> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const stored = await loadMatch(id, deps.db);
    if (!stored) throw new MatchNotFoundError(id);
    const clock: Clock = { now: deps.now(), rng: deps.rng };
    const { record, changed } = await rule(stored, clock);
    if (!changed) return toView(stored, clock.now);

    const next = { ...record, version: stored.version + 1 };
    if (await saveMatch(next, stored.version, clock.now, deps.db)) {
      const view = toView(next, clock.now);
      await publish(view, deps);
      return view;
    }
  }
  throw new Error(`Match ${id} is changing too fast; try again.`);
}
