"use client";

import { useCallback, useEffect, useReducer } from "react";
import { planBotTurn } from "@/game/bot";
import { observedRoundReducer, observeRound } from "@/game/match";
import { createRound } from "@/game/round";
import type { Puzzle } from "@/game/types";

const TICK_MS = 50;
// Background tabs throttle timers; clamping the step effectively pauses the
// round instead of skipping reveals when the tab comes back.
const MAX_STEP_MS = 250;

function initRound(puzzle: Puzzle) {
  const botPlan = planBotTurn(
    puzzle.bot_difficulty,
    puzzle.difficulty,
    puzzle.reveal_interval_seconds * 1000,
  );
  return observeRound(createRound(puzzle, botPlan));
}

/**
 * Drives one round of the engine with a wall clock. Mount a fresh instance
 * (via `key`) for every round; the puzzle is read once, on mount.
 */
export function useRound(puzzle: Puzzle) {
  const [state, dispatch] = useReducer(observedRoundReducer, puzzle, initRound);
  const ticking = !state.round.over;

  useEffect(() => {
    if (!ticking) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      dispatch({ type: "tick", dtMs: Math.min(now - last, MAX_STEP_MS) });
      last = now;
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [ticking]);

  const buzz = useCallback(() => dispatch({ type: "buzz" }), []);
  const submit = useCallback((text: string) => dispatch({ type: "submit", text }), []);

  return { state, buzz, submit };
}
