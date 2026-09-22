import { isCorrectAnswer } from "./answer";
import type { BotPlan } from "./bot";
import { pointsForReveal, REVEAL_COUNT } from "./scoring";
import type { Puzzle } from "./types";

/**
 * One round of REVEAL -> BUZZ -> ANSWER as a pure reducer (no timers, no React),
 * so the same rules can later run on the server (GDD §27).
 *
 * Timing model:
 * - A shared reveal clock drives reveals every `reveal_interval_seconds` (§6.1).
 * - A buzz freezes the reveal clock while that side answers (§7); it resumes after.
 * - Answering is exclusive: while one side answers, the other cannot buzz.
 * - A wrong answer (or running out of the 8 s window) ends that side's round;
 *   the other side keeps playing (§7). A correct answer does too — the opponent
 *   can still score in the same round (§39 shows both players scoring).
 * - The round ends when both sides are done, or when the reveal window
 *   (5 reveals x interval = 15 s) runs out with nobody answering.
 */

export const ANSWER_WINDOW_MS = 8000;

export type Side = "player" | "bot";

export type SideState =
  | { kind: "waiting" }
  | { kind: "answering"; reveal: number }
  | { kind: "correct"; reveal: number; points: number; answer?: string }
  | { kind: "wrong"; reveal: number; answer?: string; timedOut: boolean }
  | { kind: "no-buzz" };

export interface RoundState {
  puzzle: Puzzle;
  intervalMs: number;
  windowMs: number;
  /** Reveal clock; does not advance while someone is answering. */
  clockMs: number;
  /** Time spent in the current answer window. */
  answerMs: number;
  answering: Side | null;
  player: SideState;
  bot: SideState;
  botPlan: BotPlan;
  over: boolean;
}

export type RoundEvent =
  | { type: "tick"; dtMs: number }
  | { type: "buzz" }
  | { type: "submit"; text: string }
  | { type: "reset"; botPlan: BotPlan };

export function createRound(puzzle: Puzzle, botPlan: BotPlan): RoundState {
  const intervalMs = puzzle.reveal_interval_seconds * 1000;
  return {
    puzzle,
    intervalMs,
    windowMs: intervalMs * REVEAL_COUNT,
    clockMs: 0,
    answerMs: 0,
    answering: null,
    player: { kind: "waiting" },
    bot: { kind: "waiting" },
    botPlan,
    over: false,
  };
}

/** Current reveal stage, 1-5. Reveal 1 is visible from the start. */
export function revealStage(state: RoundState): number {
  return Math.min(
    REVEAL_COUNT,
    Math.floor(state.clockMs / state.intervalMs) + 1,
  );
}

function isDone(side: SideState): boolean {
  return side.kind !== "waiting" && side.kind !== "answering";
}

function finishAnswer(
  state: RoundState,
  side: Side,
  result: SideState,
): RoundState {
  const next: RoundState = {
    ...state,
    [side]: result,
    answering: null,
    answerMs: 0,
  };
  return { ...next, over: isDone(next.player) && isDone(next.bot) };
}

function answeringReveal(side: SideState): number {
  return side.kind === "answering" ? side.reveal : REVEAL_COUNT;
}

function tick(state: RoundState, dtMs: number): RoundState {
  if (state.over) return state;
  const dt = Math.max(0, dtMs);

  if (state.answering === "player") {
    const answerMs = state.answerMs + dt;
    if (answerMs < ANSWER_WINDOW_MS) return { ...state, answerMs };
    return finishAnswer(state, "player", {
      kind: "wrong",
      reveal: answeringReveal(state.player),
      timedOut: true,
    });
  }

  if (state.answering === "bot") {
    const answerMs = state.answerMs + dt;
    if (answerMs < state.botPlan.answerDelayMs) return { ...state, answerMs };
    const reveal = answeringReveal(state.bot);
    return finishAnswer(
      state,
      "bot",
      state.botPlan.correct
        ? { kind: "correct", reveal, points: pointsForReveal(reveal) }
        : { kind: "wrong", reveal, timedOut: false },
    );
  }

  const target = state.clockMs + dt;

  if (state.bot.kind === "waiting" && state.botPlan.buzzAtMs <= target) {
    const atBuzz = {
      ...state,
      clockMs: Math.max(state.clockMs, state.botPlan.buzzAtMs),
    };
    return {
      ...atBuzz,
      answering: "bot",
      answerMs: 0,
      bot: { kind: "answering", reveal: revealStage(atBuzz) },
    };
  }

  if (target >= state.windowMs) {
    const expire = (s: SideState): SideState =>
      s.kind === "waiting" ? { kind: "no-buzz" } : s;
    return {
      ...state,
      clockMs: state.windowMs,
      player: expire(state.player),
      bot: expire(state.bot),
      over: true,
    };
  }

  return { ...state, clockMs: target };
}

export function roundReducer(state: RoundState, event: RoundEvent): RoundState {
  switch (event.type) {
    case "tick":
      return tick(state, event.dtMs);

    case "buzz":
      if (state.over || state.answering || state.player.kind !== "waiting") {
        return state;
      }
      return {
        ...state,
        answering: "player",
        answerMs: 0,
        player: { kind: "answering", reveal: revealStage(state) },
      };

    case "submit": {
      if (state.answering !== "player") return state;
      const reveal = answeringReveal(state.player);
      const answer = event.text.trim();
      return finishAnswer(
        state,
        "player",
        isCorrectAnswer(answer, state.puzzle)
          ? { kind: "correct", reveal, points: pointsForReveal(reveal), answer }
          : { kind: "wrong", reveal, answer, timedOut: false },
      );
    }

    case "reset":
      return createRound(state.puzzle, event.botPlan);
  }
}
