import { planBotTurn, type Rng } from "@/game/bot";
import { advance, createMatch, type MatchState, recordRound } from "@/game/match";
import { replayRound, type RoundTimeline } from "@/game/timeline";
import type { Puzzle } from "@/game/types";

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
  /** The running round, or null before a round starts and after it finishes. */
  round: RoundTimeline | null;
}

export interface Clock {
  now: number;
  rng: Rng;
}

export type Outcome = { record: MatchRecord; changed: boolean };

const same = (record: MatchRecord): Outcome => ({ record, changed: false });
const changed = (record: MatchRecord): Outcome => ({ record, changed: true });

function startTimeline(puzzle: Puzzle, { now, rng }: Clock): RoundTimeline {
  const botPlan = planBotTurn(puzzle.bot_difficulty, puzzle.difficulty, puzzle.reveal_interval_seconds * 1000, rng);
  return { startedAt: now, botPlan, events: [] };
}

/** A new match; its first round starts when the player's screen is ready (startRound). */
export function newMatchRecord(schedule: Puzzle[]): Omit<MatchRecord, "id"> {
  return { version: 0, match: createMatch(schedule), round: null };
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
  return changed({ ...record, round: startTimeline(record.match.current, clock) });
}

/**
 * The player's buzz, timed by the server. Kept only if the engine accepts it: not
 * while the bot answers (§7: answering is exclusive), not twice, not after the end.
 */
export function buzz(record: MatchRecord, clock: Clock): Outcome & { accepted: boolean } {
  const current = catchUp(record, clock.now);
  const round = current.record.round;
  if (!round) return { ...current, accepted: false };
  const candidate = { ...current.record, round: { ...round, events: [...round.events, { at: clock.now - round.startedAt, type: "buzz" as const }] } };
  const accepted = replayNow(candidate, clock.now)?.state.round.player.kind === "answering";
  return accepted ? { record: candidate, changed: true, accepted } : { ...current, accepted };
}

/** The player's answer, checked by the server (§26.1). Ignored unless the player is answering. */
export function submitAnswer(record: MatchRecord, clock: Clock, text: string): Outcome & { accepted: boolean } {
  const current = catchUp(record, clock.now);
  const round = current.record.round;
  if (!round || replayNow(current.record, clock.now)?.state.round.player.kind !== "answering") {
    return { ...current, accepted: false };
  }
  const withAnswer = {
    ...current.record,
    round: { ...round, events: [...round.events, { at: clock.now - round.startedAt, type: "submit" as const, text }] },
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
  const round = match.status === "playing" ? startTimeline(match.current, clock) : null;
  return changed({ ...current.record, match, round });
}
