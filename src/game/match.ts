import type { Rng } from "./bot";
import { roundReducer, type RoundEvent, type RoundState, type Side, type SideState } from "./round";
import type { Puzzle, PuzzleType } from "./types";

/**
 * Match layer on top of the round engine (round.ts is used as-is, never modified here).
 * A match is 5 rounds in §5 order; a tie after them goes to Sudden Death (§12.1).
 */

/** GDD §5 — one round per puzzle type, in this order. */
export const ROUND_ORDER: PuzzleType[] = [
  "goal_map",
  "photo_reveal",
  "missing_xi",
  "career_journey",
  "teammate_web",
];

// ---------------------------------------------------------------------------
// Observing a round
// ---------------------------------------------------------------------------

/**
 * Round state plus facts the engine does not record itself: when each side
 * buzzed (reveal-clock ms, for §12 stats) and which side answered correctly
 * first (for Sudden Death, where the first correct answer wins).
 */
export interface ObservedRound {
  round: RoundState;
  playerBuzzMs: number | null;
  botBuzzMs: number | null;
  firstCorrect: Side | null;
}

export function observeRound(round: RoundState): ObservedRound {
  return { round, playerBuzzMs: null, botBuzzMs: null, firstCorrect: null };
}

const becameCorrect = (prev: SideState, next: SideState) =>
  prev.kind !== "correct" && next.kind === "correct";

/** Wraps the engine's reducer; the round rules themselves stay in round.ts. */
export function observedRoundReducer(s: ObservedRound, event: RoundEvent): ObservedRound {
  const round = roundReducer(s.round, event);
  if (round === s.round) return s;

  const buzzedAt = (side: Side, prev: number | null) =>
    prev ?? (round[side].kind === "answering" ? round.clockMs : null);

  let firstCorrect = s.firstCorrect;
  if (!firstCorrect && becameCorrect(s.round.player, round.player)) firstCorrect = "player";
  if (!firstCorrect && becameCorrect(s.round.bot, round.bot)) firstCorrect = "bot";

  return {
    round,
    playerBuzzMs: buzzedAt("player", s.playerBuzzMs),
    botBuzzMs: buzzedAt("bot", s.botBuzzMs),
    firstCorrect,
  };
}

/** Regular rounds end with the engine; Sudden Death ends at the first correct answer. */
export function isRoundFinished(s: ObservedRound, suddenDeath: boolean): boolean {
  return s.round.over || (suddenDeath && s.firstCorrect !== null);
}

// ---------------------------------------------------------------------------
// Match state
// ---------------------------------------------------------------------------

export interface RoundRecord {
  puzzle: Puzzle;
  suddenDeath: boolean;
  player: SideState;
  bot: SideState;
  playerBuzzMs: number | null;
  botBuzzMs: number | null;
  firstCorrect: Side | null;
}

export type MatchStatus = "playing" | "round-result" | "over";

export interface MatchState {
  /** The 5 regular rounds, in play order. */
  schedule: Puzzle[];
  /** Finished rounds, including Sudden Death ones. */
  rounds: RoundRecord[];
  /** Puzzle being played, or whose result is on screen. */
  current: Puzzle;
  suddenDeath: boolean;
  status: MatchStatus;
  winner: Side | null;
}

/** Picks one published puzzle per type in §5 order. */
export function buildSchedule(pool: Puzzle[]): Puzzle[] {
  return ROUND_ORDER.map((type) => {
    const puzzle = pool.find((p) => p.type === type && p.status === "published");
    if (!puzzle) throw new Error(`No published ${type} puzzle in the pool`);
    return puzzle;
  });
}

export function createMatch(schedule: Puzzle[]): MatchState {
  return {
    schedule,
    rounds: [],
    current: schedule[0],
    suddenDeath: false,
    status: "playing",
    winner: null,
  };
}

export function recordRound(match: MatchState, observed: ObservedRound): MatchState {
  const record: RoundRecord = {
    puzzle: match.current,
    suddenDeath: match.suddenDeath,
    player: observed.round.player,
    bot: observed.round.bot,
    playerBuzzMs: observed.playerBuzzMs,
    botBuzzMs: observed.botBuzzMs,
    firstCorrect: observed.firstCorrect,
  };
  return { ...match, rounds: [...match.rounds, record], status: "round-result" };
}

export const pointsOf = (side: SideState) => (side.kind === "correct" ? side.points : 0);

/** Match score: regular rounds only. Sudden Death decides the winner, it adds no points. */
export function totals(rounds: RoundRecord[]): Record<Side, number> {
  return rounds
    .filter((r) => !r.suddenDeath)
    .reduce(
      (acc, r) => ({ player: acc.player + pointsOf(r.player), bot: acc.bot + pointsOf(r.bot) }),
      { player: 0, bot: 0 },
    );
}

export const regularRoundsPlayed = (match: MatchState) =>
  match.rounds.filter((r) => !r.suddenDeath).length;

/** The winner if the match is decided by the rounds played so far, else null. */
export function decidedWinner(match: MatchState): Side | null {
  if (regularRoundsPlayed(match) < match.schedule.length) return null;
  const last = match.rounds.at(-1);
  if (last?.suddenDeath) return last.firstCorrect;
  const t = totals(match.rounds);
  if (t.player === t.bot) return null;
  return t.player > t.bot ? "player" : "bot";
}

/** §12.1 — a random extra puzzle, preferring ones not yet played this match. */
export function pickSuddenDeathPuzzle(pool: Puzzle[], rounds: RoundRecord[], rng: Rng): Puzzle {
  const played = new Set(rounds.map((r) => r.puzzle.id));
  const published = pool.filter((p) => p.status === "published");
  const fresh = published.filter((p) => !played.has(p.id));
  const candidates = fresh.length > 0 ? fresh : published;
  return candidates[Math.floor(rng() * candidates.length)];
}

/** Leaves the round result: next regular round, a Sudden Death round, or the final result. */
export function advance(match: MatchState, pool: Puzzle[], rng: Rng): MatchState {
  const played = regularRoundsPlayed(match);
  if (played < match.schedule.length) {
    return { ...match, current: match.schedule[played], status: "playing" };
  }
  const winner = decidedWinner(match);
  if (winner) return { ...match, status: "over", winner };
  return {
    ...match,
    current: pickSuddenDeathPuzzle(pool, match.rounds, rng),
    suddenDeath: true,
    status: "playing",
  };
}

// ---------------------------------------------------------------------------
// §12 match result stats (player side)
// ---------------------------------------------------------------------------

export interface MatchStats {
  correct: number;
  rounds: number;
  /** Mean reveal-clock time of the player's buzzes, or null if they never buzzed. */
  averageBuzzMs: number | null;
  bestRound: { puzzle: Puzzle; points: number } | null;
  /** Fastest buzz that led to a correct answer. */
  fastestCorrectMs: number | null;
}

export function playerStats(match: MatchState): MatchStats {
  const regular = match.rounds.filter((r) => !r.suddenDeath);
  const buzzes = regular.flatMap((r) => (r.playerBuzzMs === null ? [] : [r.playerBuzzMs]));
  const correct = regular.filter((r) => r.player.kind === "correct");
  const best = correct.reduce<RoundRecord | null>(
    (top, r) => (top === null || pointsOf(r.player) > pointsOf(top.player) ? r : top),
    null,
  );
  const fastest = correct.flatMap((r) => (r.playerBuzzMs === null ? [] : [r.playerBuzzMs]));

  return {
    correct: correct.length,
    rounds: regular.length,
    averageBuzzMs: buzzes.length ? buzzes.reduce((a, b) => a + b, 0) / buzzes.length : null,
    bestRound: best ? { puzzle: best.puzzle, points: pointsOf(best.player) } : null,
    fastestCorrectMs: fastest.length ? Math.min(...fastest) : null,
  };
}
