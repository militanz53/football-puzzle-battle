import type { Rng } from "@/game/bot";
import { randomNickname } from "./nicknames";
import type { MatchView } from "./view";

// Quick Match (GDD §13.1). PLAY joins a queue; while the player's screen polls, the
// server looks for another waiting player. If one is found both entries are marked
// "paired" (the real-opponent path; playing against each other needs opponent events
// in the engine, the next step, so for now each still plays the engine's opponent).
// If nobody turns up within the search window the entry times out and the bot takes
// the match under a random nickname. Whether the opponent was a bot is stored in the
// tables only (match_queue.status, matches.opponent_kind), never shown.

/** The search lasts a random 5-10 s (7.5 s on average), like a real queue would. */
export const SEARCH_MIN_MS = 5_000;
export const SEARCH_MAX_MS = 10_000;
/** A waiting entry is only paired while its screen is still polling. */
export const FRESH_SECONDS = 5;

export type QueueStatus = "waiting" | "paired" | "timed_out" | "abandoned";

export interface QueueEntry {
  id: string;
  sessionId: string;
  status: QueueStatus;
  /** Epoch ms. */
  searchUntil: number;
  pairedWith: string | null;
  matchId: string | null;
}

/** The match_queue table (./queueStore.ts), or an in-memory stand-in in tests. */
export interface QueueStore {
  insert(sessionId: string, searchUntil: number): Promise<QueueEntry>;
  get(id: string): Promise<QueueEntry | null>;
  /** The entry's screen is still polling. */
  touch(id: string): Promise<void>;
  /** Pairs a waiting entry with another fresh waiting one, atomically; the partner's id or null. */
  claimPartner(id: string, freshSeconds: number): Promise<string | null>;
  /** waiting → timed_out / abandoned; false if the entry was no longer waiting. */
  resolve(id: string, status: "timed_out" | "abandoned"): Promise<boolean>;
  /** Links the entry to its match once; false if it already had one. */
  setMatch(id: string, matchId: string): Promise<boolean>;
}

export interface QueueDeps {
  store: QueueStore;
  now: () => number;
  rng: Rng;
  /** Creates the match against the engine's opponent and returns its view. */
  createMatch: (opponentName: string, queueEntryId: string) => Promise<MatchView>;
  /** The view of a match already created for this entry. */
  viewMatch: (matchId: string) => Promise<MatchView>;
}

export type QueuePoll =
  | { status: "searching" }
  | { status: "found"; view: MatchView }
  | { status: "gone" };

export class QueueAccessError extends Error {
  constructor() {
    super("This queue entry does not belong to this browser");
    this.name = "QueueAccessError";
  }
}

export async function joinQueue(sessionId: string, deps: QueueDeps): Promise<QueueEntry> {
  const searchMs = SEARCH_MIN_MS + Math.floor(deps.rng() * (SEARCH_MAX_MS - SEARCH_MIN_MS + 1));
  return deps.store.insert(sessionId, deps.now() + searchMs);
}

/**
 * One poll from the searching screen: keep searching, or hand over the match. Only
 * the browser that joined may poll its entry. Safe to repeat: an entry gets one match.
 */
export async function pollQueue(entryId: string, sessionId: string, deps: QueueDeps): Promise<QueuePoll> {
  let entry = await deps.store.get(entryId);
  if (!entry || entry.sessionId !== sessionId) throw new QueueAccessError();
  if (entry.matchId) return { status: "found", view: await deps.viewMatch(entry.matchId) };
  if (entry.status === "abandoned") return { status: "gone" };

  if (entry.status === "waiting") {
    await deps.store.touch(entry.id);
    const partner = await deps.store.claimPartner(entry.id, FRESH_SECONDS);
    if (partner) {
      entry = { ...entry, status: "paired", pairedWith: partner };
    } else if (deps.now() < entry.searchUntil) {
      return { status: "searching" };
    } else if (!(await deps.store.resolve(entry.id, "timed_out"))) {
      // Resolved by someone else meanwhile (paired at the last moment): look again next poll.
      return { status: "searching" };
    }
  }

  // Paired or timed out: this entry's match. The engine's opponent plays it for now.
  const view = await deps.createMatch(randomNickname(deps.rng), entry.id);
  if (!(await deps.store.setMatch(entry.id, view.id))) {
    const winner = await deps.store.get(entry.id);
    if (winner?.matchId) return { status: "found", view: await deps.viewMatch(winner.matchId) };
  }
  return { status: "found", view };
}

/** The player left the searching screen. */
export async function leaveQueue(entryId: string, sessionId: string, deps: QueueDeps): Promise<void> {
  const entry = await deps.store.get(entryId);
  if (!entry || entry.sessionId !== sessionId) throw new QueueAccessError();
  await deps.store.resolve(entry.id, "abandoned");
}
