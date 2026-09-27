import type { Rng } from "@/game/bot";
import { randomNickname } from "./nicknames";
import type { MatchView } from "./view";

// Quick Match (GDD §13.1). PLAY joins a queue; while the player's screen polls, the
// server looks for another waiting player. If one is found both entries are marked
// "paired" and the two play ONE match against each other (seat a / seat b). If nobody
// turns up within the search window the entry times out and the bot takes the match
// under a random nickname. Whether the opponent was a bot is stored in the tables
// only (match_queue.status, matches.opponent_kind), never shown.
//
// Ranked (§13.5) uses the same queue in its own lane (match_queue.mode): a ranked
// entry is only paired with another ranked entry, never with its own account, and
// never gets the bot. Rating against the bot would mean nothing, so a ranked search
// that finds nobody simply ends ("no-opponent") and the player may search again.

/** The search lasts a random 5-10 s (7.5 s on average), like a real queue would. */
export const SEARCH_MIN_MS = 5_000;
export const SEARCH_MAX_MS = 10_000;
/** A waiting entry is only paired while its screen is still polling (and once it has polled at all). */
export const FRESH_SECONDS = 5;
/**
 * Once paired, one of the two builds the shared match. If the other has not seen it
 * after this long (the builder's tab closed at that moment), they play the bot instead.
 */
export const HANDOFF_MS = 8_000;

export type QueueStatus = "waiting" | "paired" | "timed_out" | "abandoned";
export type QueueMode = "quick" | "ranked";

export interface QueueEntry {
  id: string;
  sessionId: string;
  status: QueueStatus;
  /** Epoch ms. */
  searchUntil: number;
  pairedWith: string | null;
  matchId: string | null;
  /** When the entry was paired or timed out (epoch ms), or null while waiting. */
  resolvedAt: number | null;
  /** The player's nickname (§13.2), shown to a real opponent; a ranked entry's username. */
  nickname: string | null;
  mode: QueueMode;
  /** The ranked account searching; null in Quick Match. */
  userId: string | null;
}

/** The match_queue table (./queueStore.ts), or an in-memory stand-in in tests. */
export interface QueueStore {
  /** A new waiting entry; with `userId`, in the ranked lane. */
  insert(sessionId: string, searchUntil: number, nickname: string, userId?: string): Promise<QueueEntry>;
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
  /** Creates one match for two paired players and returns it as seat a sees it. */
  createRealMatch: (a: QueuedPlayer, b: QueuedPlayer, mode: QueueMode) => Promise<MatchView>;
  /** The view of a match already created for this entry. */
  viewMatch: (matchId: string) => Promise<MatchView>;
}

/** One side of a pairing, as the queue knows it. */
export interface QueuedPlayer {
  sessionId: string;
  name: string;
  /** Ranked only. */
  userId: string | null;
}

export type QueuePoll =
  | { status: "searching" }
  | { status: "found"; view: MatchView }
  | { status: "gone" }
  /** Ranked only: the search window passed without another ranked player. */
  | { status: "no-opponent" };

export class QueueAccessError extends Error {
  constructor() {
    super("This queue entry does not belong to this browser");
    this.name = "QueueAccessError";
  }
}

const searchWindow = (deps: QueueDeps) => SEARCH_MIN_MS + Math.floor(deps.rng() * (SEARCH_MAX_MS - SEARCH_MIN_MS + 1));

export async function joinQueue(sessionId: string, nickname: string, deps: QueueDeps): Promise<QueueEntry> {
  return deps.store.insert(sessionId, deps.now() + searchWindow(deps), nickname);
}

/** RANKED: joins the ranked lane as this account, under its username. */
export async function joinRankedQueue(sessionId: string, account: { userId: string; username: string }, deps: QueueDeps): Promise<QueueEntry> {
  return deps.store.insert(sessionId, deps.now() + searchWindow(deps), account.username, account.userId);
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
      entry = { ...entry, status: "paired", pairedWith: partner, resolvedAt: deps.now() };
    } else if (deps.now() < entry.searchUntil) {
      return { status: "searching" };
    } else if (!(await deps.store.resolve(entry.id, "timed_out"))) {
      // Resolved by someone else meanwhile (paired at the last moment): look again next poll.
      return { status: "searching" };
    }
  }

  if (entry.status === "paired" && entry.pairedWith) {
    const partner = await deps.store.get(entry.pairedWith);
    // One match for both. The entry with the smaller id builds it (a fixed choice, so
    // the two never both build one) and links both entries to it; the other waits.
    if (partner && entry.id < partner.id) {
      // Each sees the other's own nickname (§13.2); an entry from before nicknames gets a made-up one.
      const view = await deps.createRealMatch(
        { sessionId: entry.sessionId, name: entry.nickname ?? randomNickname(deps.rng), userId: entry.userId },
        { sessionId: partner.sessionId, name: partner.nickname ?? randomNickname(deps.rng), userId: partner.userId },
        entry.mode,
      );
      await deps.store.setMatch(entry.id, view.id);
      await deps.store.setMatch(partner.id, view.id);
      return { status: "found", view };
    }
    if (partner && deps.now() - (entry.resolvedAt ?? deps.now()) < HANDOFF_MS) return { status: "searching" };
    // The builder never came back with the match: play the bot rather than wait forever.
  }

  // Ranked never plays the bot: nobody (or nobody reliable) was found.
  if (entry.mode === "ranked") return { status: "no-opponent" };

  // Timed out (or the pairing fell through): this entry's match against the bot.
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
