import { planBotTurn, type Rng } from "@/game/bot";
import { advance, createMatch, type MatchState, recordRound } from "@/game/match";
import type { Side } from "@/game/round";
import { replayRound, type RoundTimeline } from "@/game/timeline";
import type { Puzzle } from "@/game/types";
import { isRanked, type RankedResult } from "./ranked";

// The match rules as run by the server (GDD §27): start a round, take a buzz or an
// answer, notice a finished round, move on. Pure functions over a MatchRecord, the
// server clock and a random source; the engine (src/game) does the actual rules.
// Persistence and Realtime are in ./runner.ts, not here, so this is easy to test.

export interface MatchRecord {
  id: string;
  /** Bumped on every write (optimistic concurrency, see ./store.ts). */
  version: number;
  /** The match layer's own state; puzzles here include their answers. */
  match: MatchState;
  /**
   * The name the player sees for the opponent (a random nickname when the bot
   * plays, §13.1). Whether it is a bot is stored only in the table (opponent_kind).
   */
  opponentName: string;
  /** The running round, or null before a round starts and after it finishes. */
  round: RoundTimeline | null;
  /** Set only when two real players share the match (§13.1); a bot match has none. */
  players?: Players | null;
  /** Set when the match ended early because a player left. */
  ended?: { reason: "left"; seat: Seat } | null;
  /** After a real-player match: when each seat asked for a rematch, and the new match once both did. */
  rematch?: RematchOffers | null;
  /** A ranked match once it is over and applied to both profiles (§14). */
  rankedResult?: RankedResult | null;
}

export interface RematchOffers {
  a?: number;
  b?: number;
  /** The rematch, once both seats asked within REMATCH_WINDOW_MS. */
  next?: string;
}

/** A rematch offer stands this long for the other player to accept (§13.1). */
export const REMATCH_WINDOW_MS = 10_000;

/** Whether an offer made at `at` still stands at `now`. */
export const offerStands = (at: number | undefined, now: number): at is number => at !== undefined && now - at <= REMATCH_WINDOW_MS;

/** Seat a is the engine's "player" side, seat b its opponent ("bot") side. */
export type Seat = "a" | "b";
export const sideOf = (seat: Seat): Side => (seat === "a" ? "player" : "bot");
export const otherSeat = (seat: Seat): Seat => (seat === "a" ? "b" : "a");

export interface SeatPlayer {
  session: string;
  name: string;
  /** Ranked (§13.5): the account in this seat and its rating when the match was made. */
  account?: { userId: string; rating: number };
}

export interface Players {
  a: SeatPlayer;
  b: SeatPlayer;
  /** When the match was made (epoch ms): presence counts from here until a seat first checks in. */
  since: number;
}

/**
 * Presence (§28: "about 15 s to reconnect"). The match screen checks in every 3 s. A
 * seat silent for AWAY_AFTER_MS is away: both players are told, and a 15 s reconnect
 * window runs. Back in time, the match carries on where it is; still silent at the
 * end of the window, the seat has left and the other player wins.
 */
export const AWAY_AFTER_MS = 5_000;
export const RECONNECT_WINDOW_MS = 15_000;
export const LEAVE_AFTER_MS = AWAY_AFTER_MS + RECONNECT_WINDOW_MS;
/** A seat that has not checked in yet is still loading the match: count from a little after it was made. */
export const START_GRACE_MS = 5_000;

/** How long `seat` has been silent at `now`. */
export function silentFor(players: Players, seen: Record<Seat, number | null>, seat: Seat, now: number): number {
  return Math.max(0, now - (seen[seat] ?? players.since + START_GRACE_MS));
}

export interface Clock {
  now: number;
  rng: Rng;
}

export type Outcome = { record: MatchRecord; changed: boolean };

const same = (record: MatchRecord): Outcome => ({ record, changed: false });
const changed = (record: MatchRecord): Outcome => ({ record, changed: true });

/** A round starts: the bot gets its plan (§29.1); a real opponent needs none, they act for themselves. */
function startTimeline(puzzle: Puzzle, { now, rng }: Clock, realOpponent: boolean): RoundTimeline {
  if (realOpponent) return { startedAt: now, botPlan: null, events: [] };
  const botPlan = planBotTurn(puzzle.bot_difficulty, puzzle.difficulty, puzzle.reveal_interval_seconds * 1000, rng);
  return { startedAt: now, botPlan, events: [] };
}

/** A new match; its first round starts when the player's screen is ready (startRound). */
export function newMatchRecord(schedule: Puzzle[], opponentName: string, players: Players | null = null): Omit<MatchRecord, "id"> {
  return { version: 0, match: createMatch(schedule), opponentName, round: null, players, ended: null, rematch: null };
}

/** The running round replayed to `now`. */
export function replayNow(record: MatchRecord, now: number) {
  if (record.match.status !== "playing" || !record.round) return null;
  return replayRound(record.match.current, record.round, now - record.round.startedAt, record.match.suddenDeath);
}

/** Records the running round if it has finished by `now` (§11: the result screen follows). */
export function catchUp(record: MatchRecord, now: number): Outcome {
  const replay = replayNow(record, now);
  if (!replay || replay.finishedAtMs === null) return same(record);
  return changed({ ...record, match: recordRound(record.match, replay.state), round: null });
}

/** Starts the current round if it has not started yet. Idempotent. */
export function startRound(record: MatchRecord, clock: Clock): Outcome {
  if (record.match.status !== "playing" || record.round) return same(record);
  return changed({ ...record, round: startTimeline(record.match.current, clock, Boolean(record.players)) });
}

/**
 * A buzz, timed by the server, from the player (side "player") or, in a real-player
 * match, from the opponent's seat (side "bot"). Kept only if the engine accepts it:
 * not while the other side answers (§7: answering is exclusive), not twice, not
 * after the end.
 */
export function buzz(record: MatchRecord, clock: Clock, side: Side = "player"): Outcome & { accepted: boolean } {
  const current = catchUp(record, clock.now);
  const round = current.record.round;
  if (!round || (side === "bot" && round.botPlan)) return { ...current, accepted: false };
  const event = { at: clock.now - round.startedAt, type: "buzz" as const, ...(side === "bot" ? { side } : {}) };
  const candidate = { ...current.record, round: { ...round, events: [...round.events, event] } };
  const accepted = replayNow(candidate, clock.now)?.state.round[side].kind === "answering";
  return accepted ? { record: candidate, changed: true, accepted } : { ...current, accepted };
}

/** An answer, checked by the server (§26.1). Ignored unless that side is answering. */
export function submitAnswer(record: MatchRecord, clock: Clock, text: string, side: Side = "player"): Outcome & { accepted: boolean } {
  const current = catchUp(record, clock.now);
  const round = current.record.round;
  if (!round || (side === "bot" && round.botPlan) || replayNow(current.record, clock.now)?.state.round[side].kind !== "answering") {
    return { ...current, accepted: false };
  }
  const event = { at: clock.now - round.startedAt, type: "submit" as const, text, ...(side === "bot" ? { side } : {}) };
  const withAnswer = {
    ...current.record,
    round: { ...round, events: [...round.events, event] },
  };
  // A Sudden Death round ends at a correct answer, so record it straight away.
  return { ...catchUp(withAnswer, clock.now), changed: true, accepted: true };
}

/**
 * Leaves the round result: the next regular round, a Sudden Death round (§12.1, drawn
 * from `pool`) or the final result. A new round starts at once, as the screen shows it.
 */
export async function nextRound(record: MatchRecord, clock: Clock, loadPool: () => Promise<Puzzle[]>): Promise<Outcome> {
  const current = catchUp(record, clock.now);
  if (current.record.match.status !== "round-result") return current;
  // The pool is only needed for a Sudden Death puzzle; advance() only reads it then.
  const needsPool = current.record.match.rounds.filter((r) => !r.suddenDeath).length >= current.record.match.schedule.length;
  const match = advance(current.record.match, needsPool ? await loadPool() : [], clock.rng);
  const round = match.status === "playing" ? startTimeline(match.current, clock, Boolean(current.record.players)) : null;
  return changed({ ...current.record, match, round });
}

/**
 * Presence in a real-player match: if the other seat has not checked in for
 * LEAVE_AFTER_MS, they have left (closed the tab, lost the connection) and `seat`
 * wins the match at once. The simplest fair rule: nobody is left waiting on a
 * player who is gone. `seen` holds each seat's last check-in (epoch ms) or null.
 */
export function forfeitIfGone(record: MatchRecord, now: number, seat: Seat, seen: Record<Seat, number | null>): Outcome {
  const players = record.players;
  if (!players || record.match.status === "over") return same(record);
  const gone = otherSeat(seat);
  if (silentFor(players, seen, gone, now) < LEAVE_AFTER_MS) return same(record);
  return changed({
    ...record,
    match: { ...record.match, status: "over", winner: sideOf(seat) },
    round: null,
    ended: { reason: "left", seat: gone },
  });
}

/**
 * A seat asks for a rematch after a real-player match (§13.1). The offer stands for
 * REMATCH_WINDOW_MS; `bothAsked` says the other seat's offer stands too, so the caller
 * should make the new match (see linkRematch). Asking again keeps the first time.
 */
export function requestRematch(record: MatchRecord, now: number, seat: Seat): Outcome & { bothAsked: boolean } {
  const offers = record.rematch ?? {};
  // Ranked has no rematch: the same two players could trade rating back and forth.
  if (!record.players || isRanked(record) || record.match.status !== "over") return { ...same(record), bothAsked: false };
  if (offers.next) return { ...same(record), bothAsked: true };
  const bothAsked = offerStands(offers[otherSeat(seat)], now);
  if (offerStands(offers[seat], now)) return { ...same(record), bothAsked };
  return { record: { ...record, rematch: { ...offers, [seat]: now } }, changed: true, bothAsked };
}

/** Links the rematch to this match, once: whoever links first wins, the other follows it. */
export function linkRematch(record: MatchRecord, nextId: string): Outcome {
  if (record.rematch?.next) return same(record);
  return changed({ ...record, rematch: { ...record.rematch, next: nextId } });
}
