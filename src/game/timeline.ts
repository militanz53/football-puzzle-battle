import { isCorrectAnswer } from "./answer";
import type { BotPlan } from "./bot";
import { isRoundFinished, observedRoundReducer, observeRound, type ObservedRound } from "./match";
import { ANSWER_WINDOW_MS, createRound, type RoundEvent, type Side } from "./round";
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

/**
 * An action, `at` ms after the round started, as received by the server. `side` is
 * the engine's side: "player" (the default), or "bot", the engine's name for the
 * opponent's seat, used when that seat is a real player.
 */
export type TimelineEvent =
  | { at: number; type: "buzz"; side?: Side }
  | { at: number; type: "submit"; text: string; side?: Side };

export interface RoundTimeline {
  /** Server clock (epoch ms) when the round started. */
  startedAt: number;
  /**
   * The opponent. A plan (§29.1, decided on the server when the round starts, never
   * sent to the browser) for the bot; null when the opponent is a real player, whose
   * buzz and answer arrive as "bot"-side events instead.
   */
  botPlan: BotPlan | null;
  /** Actions in the order received. */
  events: TimelineEvent[];
}

/**
 * A real opponent, before they act: the engine is told they have not buzzed, and
 * that an answer they start runs out after the same 8 s as the player's (§7).
 * Their actual buzz and answer are written into this plan as they arrive, which is
 * all the round engine ever reads about its opponent: when they buzzed, how long
 * they took, whether they were right.
 */
export const AWAITING_OPPONENT: BotPlan = {
  buzzReveal: 0,
  buzzAtMs: Number.MAX_SAFE_INTEGER,
  answerDelayMs: ANSWER_WINDOW_MS,
  correct: false,
};

export interface Replay {
  state: ObservedRound;
  /** Milliseconds after the start when the round finished, or null while it is running. */
  finishedAtMs: number | null;
}

const toEngineEvent = (e: TimelineEvent): RoundEvent =>
  e.type === "buzz" ? { type: "buzz" } : { type: "submit", text: e.text };

const withPlan = (s: ObservedRound, change: Partial<BotPlan>): ObservedRound => ({
  ...s,
  round: { ...s.round, botPlan: { ...s.round.botPlan, ...change } },
});
const now: RoundEvent = { type: "tick", dtMs: 0 };

/**
 * A real opponent's action, under the same rules as the player's: a buzz counts only
 * while nobody answers (§7), an answer only while they answer. The engine takes it
 * through its plan: "buzz at the current clock" or "done answering now, right or
 * wrong", applied at once with a zero-length tick.
 */
function applyOpponent(s: ObservedRound, event: TimelineEvent, puzzle: Puzzle): ObservedRound {
  const round = s.round;
  if (event.type === "buzz") {
    if (round.over || round.answering || round.bot.kind !== "waiting") return s;
    return observedRoundReducer(withPlan(s, { buzzAtMs: round.clockMs }), now);
  }
  if (round.answering !== "bot") return s;
  const correct = isCorrectAnswer(event.text, puzzle);
  const done = observedRoundReducer(withPlan(s, { answerDelayMs: round.answerMs, correct }), now);
  // Keep what they typed, as the player's own answer is kept (for the result screens).
  const bot = done.round.bot;
  const answer = event.text.trim();
  return bot.kind === "correct" || bot.kind === "wrong" ? { ...done, round: { ...done.round, bot: { ...bot, answer } } } : done;
}

/**
 * The round `atMs` milliseconds after it started. Replay stops at the moment the
 * round finishes (for Sudden Death, the first correct answer), so a finished round
 * always reads the same however late it is asked about; later events are ignored.
 */
export function replayRound(puzzle: Puzzle, timeline: RoundTimeline, atMs: number, suddenDeath: boolean): Replay {
  const finished = (s: ObservedRound) => isRoundFinished(s, suddenDeath);
  const realOpponent = timeline.botPlan === null;
  let state = observeRound(createRound(puzzle, timeline.botPlan ?? AWAITING_OPPONENT));
  let position = 0;

  /** Ticks forward to `target`, stopping early if the round finishes. */
  const runTo = (target: number) => {
    while (position < target && !finished(state)) {
      const dt = Math.min(STEP_MS, target - position);
      const before = state;
      state = observedRoundReducer(state, { type: "tick", dtMs: dt });
      position += dt;
      // A real opponent can only stop answering by a tick when their 8 s ran out.
      if (realOpponent && before.round.answering === "bot" && state.round.bot.kind === "wrong") {
        state = { ...state, round: { ...state.round, bot: { ...state.round.bot, timedOut: true } } };
      }
    }
  };

  for (const event of timeline.events) {
    if (event.at > atMs) break;
    runTo(Math.max(event.at, position));
    if (finished(state)) return { state, finishedAtMs: position };
    state =
      event.side === "bot"
        ? realOpponent
          ? applyOpponent(state, event, puzzle)
          : state // the bot plays by its plan; nobody else acts for it
        : observedRoundReducer(state, toEngineEvent(event));
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
