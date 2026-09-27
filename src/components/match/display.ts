import { ANSWER_WINDOW_MS, revealStage, type RoundState } from "@/game/round";
import { REVEAL_COUNT } from "@/game/scoring";
import type { Puzzle } from "@/game/types";
import type { MatchView, PublicRound } from "@/server/match/view";

// Drawing the server's round between updates (GDD §27: the browser shows, the server
// decides). A view is a snapshot of the round when the server made it; in between,
// the browser only moves the clocks on so the timer bar runs smoothly. It never goes
// past the next change the server announced (a bot buzz, a time-out, the window
// closing): it waits there for the server's word instead of guessing.

/** The reveal stage (1-5) of a round as drawn; the engine's rule, reading only the clock. */
export function displayStage(round: Pick<RoundState, "clockMs" | "intervalMs">): number {
  return revealStage(round as RoundState);
}

/** The snapshot moved on by `elapsedMs`, stopping at the server's next announced change. */
export function projectRound(round: PublicRound, elapsedMs: number, nextChangeInMs: number | null): PublicRound {
  if (round.over) return round;
  const dt = Math.max(0, Math.min(elapsedMs, nextChangeInMs ?? Number.POSITIVE_INFINITY));
  if (round.answering === "player") return { ...round, answerMs: Math.min(ANSWER_WINDOW_MS, round.answerMs + dt) };
  if (round.answering === "bot") return { ...round, answerMs: round.answerMs + dt };
  return { ...round, clockMs: Math.min(round.windowMs, round.clockMs + dt) };
}

/**
 * How the round looks right after the player taps BUZZ, until the server confirms:
 * the answer box opens at once, as it did when the engine ran in the browser. Null
 * if a buzz cannot count (someone is answering, the player is done, the round is over).
 */
export function optimisticBuzz(round: PublicRound): PublicRound | null {
  if (round.over || round.answering || round.player.kind !== "waiting") return null;
  return { ...round, answering: "player", answerMs: 0, player: { kind: "answering", reveal: displayStage(round) } };
}

/**
 * Whether `next` should replace `current` for the same match: a later version, or
 * the same version seen later (time moved on without a write).
 */
export function isNewer(next: MatchView, current: MatchView): boolean {
  if (next.id !== current.id) return false;
  return next.version > current.version || (next.version === current.version && next.serverTime >= current.serverTime);
}

/**
 * The round before the server has started it (the moment between the screen
 * appearing and startRound answering): the first clue, the clock at 0, nobody
 * answering. Drawn so the round shows at once, as before; the clock waits for the server.
 */
export function notStartedRound(puzzle: Puzzle): PublicRound {
  const intervalMs = puzzle.reveal_interval_seconds * 1000;
  return {
    intervalMs,
    windowMs: intervalMs * REVEAL_COUNT,
    clockMs: 0,
    answerMs: 0,
    answering: null,
    player: { kind: "waiting" },
    bot: { kind: "waiting" },
    over: false,
  };
}
