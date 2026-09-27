import type { BotPlan } from "./bot";
import { isRoundFinished, observedRoundReducer, observeRound, type ObservedRound } from "./match";
import { createRound, type RoundEvent } from "./round";
import type { Puzzle } from "./types";

/**
 * Server-authoritative time for one round (GDD §27), on top of the round engine.
 *
 * The engine (round.ts) is a reducer driven by small `tick`s. In the browser a
 * timer fed it one tick every 50 ms. On the server nothing runs between requests,
 * so a round is stored as a timeline instead: when it started (server clock), the
 * bot's plan, and the player's actions with the time the server received them.
 * The round's state at any moment is the engine replayed over that timeline, in
 * small steps, exactly as the browser used to drive it. Nothing here changes the
 * engine; it only decides when its events happen.
 */

/** Engine step when replaying wall-clock time. The browser used 50 ms; smaller is closer to real time. */
export const STEP_MS = 10;

/** A player action, `at` ms after the round started, as received by the server. */
export type TimelineEvent = { at: number; type: "buzz" } | { at: number; type: "submit"; text: string };

export interface RoundTimeline {
  /** Server clock (epoch ms) when the round started. */
  startedAt: number;
  /** §29.1: decided on the server when the round starts; never sent to the browser. */
  botPlan: BotPlan;
  /** Player actions in the order received. */
  events: TimelineEvent[];
}

export interface Replay {
  state: ObservedRound;
  /** Milliseconds after the start when the round finished, or null while it is running. */
  finishedAtMs: number | null;
}

const toEngineEvent = (e: TimelineEvent): RoundEvent =>
  e.type === "buzz" ? { type: "buzz" } : { type: "submit", text: e.text };

/**
 * The round `atMs` milliseconds after it started. Replay stops at the moment the
 * round finishes (for Sudden Death, the first correct answer), so a finished round
 * always reads the same however late it is asked about; later events are ignored.
 */
export function replayRound(puzzle: Puzzle, timeline: RoundTimeline, atMs: number, suddenDeath: boolean): Replay {
  const finished = (s: ObservedRound) => isRoundFinished(s, suddenDeath);
  let state = observeRound(createRound(puzzle, timeline.botPlan));
  let position = 0;

  /** Ticks forward to `target`, stopping early if the round finishes. */
  const runTo = (target: number) => {
    while (position < target && !finished(state)) {
      const dt = Math.min(STEP_MS, target - position);
      state = observedRoundReducer(state, { type: "tick", dtMs: dt });
      position += dt;
    }
  };

  for (const event of timeline.events) {
    if (event.at > atMs) break;
    runTo(Math.max(event.at, position));
    if (finished(state)) return { state, finishedAtMs: position };
    state = observedRoundReducer(state, toEngineEvent(event));
    if (finished(state)) return { state, finishedAtMs: position };
  }
  runTo(atMs);
  return { state, finishedAtMs: finished(state) ? position : null };
}

/**
 * How long after `atMs` the round next changes by itself: the bot buzzing or
 * answering, an answer window running out, or the reveal window closing. Null once
 * the round has finished. Reveals are not counted: the browser draws those from the
 * clock. The browser asks the server again when this time is up.
 */
export function msUntilNextChange(puzzle: Puzzle, timeline: RoundTimeline, atMs: number, suddenDeath: boolean): number | null {
  const { state: now, finishedAtMs } = replayRound(puzzle, timeline, atMs, suddenDeath);
  if (finishedAtMs !== null) return null;

  const signature = (s: ObservedRound) => `${s.round.answering}|${s.round.player.kind}|${s.round.bot.kind}|${s.round.over}`;
  const start = signature(now);
  let state = now;
  // A round cannot run longer than its reveal window plus both answer windows.
  const limit = now.round.windowMs + 30_000;
  for (let waited = 0; waited < limit; waited += STEP_MS) {
    state = observedRoundReducer(state, { type: "tick", dtMs: STEP_MS });
    if (signature(state) !== start || isRoundFinished(state, suddenDeath)) return waited + STEP_MS;
  }
  return null;
}
