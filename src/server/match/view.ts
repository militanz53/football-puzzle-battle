import { totals, type MatchState } from "@/game/match";
import type { RoundState } from "@/game/round";
import { msUntilNextChange } from "@/game/timeline";
import type { Puzzle } from "@/game/types";
import { replayNow, type MatchRecord } from "./service";

// What a browser may know about a match. Sent by the Server Functions and over
// Realtime. Everything here is safe to show: no bot plan, and no answer for a puzzle
// whose round is still to come or running.

/** The running round as the browser draws it: the engine state minus puzzle and bot plan. */
export type PublicRound = Omit<RoundState, "puzzle" | "botPlan">;

export interface MatchView {
  id: string;
  version: number;
  /** Server clock when this view was made; views of the same version are ordered by it. */
  serverTime: number;
  /** The match, with puzzles still in play stripped of their answers. */
  match: MatchState;
  /** Shown wherever the opponent is named. Never says whether it is a bot. */
  opponentName: string;
  /** The running round, or null before it starts and once it has finished. */
  round: PublicRound | null;
  /** When the round next changes by itself (bot, time-outs); the browser asks again then. */
  nextChangeInMs: number | null;
}

/**
 * A puzzle without what gives it away: the answer and aliases, the tags, and the
 * missing player's name in a Missing XI line-up (the board shows "?" there anyway).
 */
export function hideAnswer(puzzle: Puzzle): Puzzle {
  const hidden = { ...puzzle, correct_answer: "", answer_aliases: [], tags: [] } as Puzzle;
  if (hidden.type === "missing_xi") {
    hidden.reveal_data = {
      ...hidden.reveal_data,
      lineup: hidden.reveal_data.lineup.map((slot) => (slot.missing ? { ...slot, name: "?" } : slot)),
    };
  }
  return hidden;
}

function publicRound(state: RoundState): PublicRound {
  const round: Partial<RoundState> = { ...state };
  delete round.puzzle; // the view carries the (answer-less) puzzle in match.current
  delete round.botPlan; // never leaves the server
  return round as PublicRound;
}

export function toView(record: MatchRecord, now: number): MatchView {
  const { match } = record;
  const replay = replayNow(record, now);
  const inPlay = match.status === "playing";
  const round = replay ? publicRound(replay.state.round) : null;
  return {
    id: record.id,
    version: record.version,
    serverTime: now,
    opponentName: record.opponentName,
    match: {
      ...match,
      schedule: match.schedule.map(hideAnswer),
      // Finished rounds keep their answers: the result screens show them (§11, §12).
      current: inPlay ? hideAnswer(match.current) : match.current,
    },
    round,
    nextChangeInMs:
      replay && record.round
        ? msUntilNextChange(match.current, record.round, now - record.round.startedAt, match.suddenDeath)
        : null,
  };
}

/** The table's readable columns, kept in step with the jsonb state on every write. */
export function summaryColumns(record: MatchRecord, now: number) {
  const { match, round } = record;
  const replay = replayNow(record, now);
  const last = match.rounds.at(-1);
  const score = totals(match.rounds);
  // The engine keeps fractional milliseconds (the bot's buzz time is drawn); the
  // integer columns get whole ones. The jsonb state keeps the exact values.
  const ms = (value: number | null | undefined) => (value === null || value === undefined ? null : Math.round(value));
  return {
    status: match.status,
    round_number: Math.max(1, match.rounds.length + (match.status === "playing" ? 1 : 0)),
    sudden_death: match.suddenDeath,
    current_puzzle_id: match.current.id,
    round_started_at: round ? new Date(round.startedAt).toISOString() : null,
    player_buzz_ms: ms(replay ? replay.state.playerBuzzMs : last?.playerBuzzMs),
    bot_buzz_ms: ms(replay ? replay.state.botBuzzMs : last?.botBuzzMs),
    player_score: score.player,
    bot_score: score.bot,
    winner: match.winner,
    opponent_name: record.opponentName,
  };
}
