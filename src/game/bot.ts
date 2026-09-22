import type { Difficulty } from "./types";

/** Everything the bot will do this round, decided up front (GDD §29.1). */
export interface BotPlan {
  /** Reveal stage (1-5) during which the bot buzzes. */
  buzzReveal: number;
  /** Reveal-clock time of the buzz, in ms from round start. */
  buzzAtMs: number;
  /** Simulated "typing" time after the buzz. */
  answerDelayMs: number;
  correct: boolean;
}

export type Rng = () => number;

const PROFILES: Record<Difficulty, { reveals: number[]; accuracy: number }> = {
  easy: { reveals: [4, 5], accuracy: 0.5 },
  medium: { reveals: [2, 3, 4], accuracy: 0.7 },
  hard: { reveals: [1, 2, 3], accuracy: 0.85 },
};

// Medium bot: reveal 2-4, weighted by the puzzle's own difficulty (§29.1).
// Easier puzzles pull the buzz earlier, harder ones later.
const MEDIUM_WEIGHTS: Record<Difficulty, number[]> = {
  easy: [0.5, 0.35, 0.15],
  medium: [0.25, 0.5, 0.25],
  hard: [0.15, 0.35, 0.5],
};

const ANSWER_DELAY_MIN_MS = 1500;
const ANSWER_DELAY_MAX_MS = 3000;

function pickWeighted<T>(items: T[], weights: number[], rng: Rng): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll < 0) return items[i];
  }
  return items[items.length - 1];
}

export function planBotTurn(
  botDifficulty: Difficulty,
  puzzleDifficulty: Difficulty,
  revealIntervalMs: number,
  rng: Rng = Math.random,
): BotPlan {
  const { reveals, accuracy } = PROFILES[botDifficulty];
  const weights =
    botDifficulty === "medium"
      ? MEDIUM_WEIGHTS[puzzleDifficulty]
      : reveals.map(() => 1);
  const buzzReveal = pickWeighted(reveals, weights, rng);

  // Fixed + random delay after the reveal appears, kept inside that stage.
  const offsetMs = revealIntervalMs * (0.15 + rng() * 0.7);

  return {
    buzzReveal,
    buzzAtMs: (buzzReveal - 1) * revealIntervalMs + offsetMs,
    answerDelayMs:
      ANSWER_DELAY_MIN_MS + rng() * (ANSWER_DELAY_MAX_MS - ANSWER_DELAY_MIN_MS),
    correct: rng() < accuracy,
  };
}
