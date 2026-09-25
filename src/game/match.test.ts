import { describe, expect, it } from "vitest";
import { loadSnapshot } from "@/test/snapshot";
import { careerPuzzle } from "./__fixtures__/careerPuzzle";
import { seeded } from "./__fixtures__/seeded";
import type { BotPlan } from "./bot";
import {
  advance,
  buildSchedule,
  createMatch,
  decidedWinner,
  isRoundFinished,
  observedRoundReducer,
  observeRound,
  pickSuddenDeathPuzzle,
  playerStats,
  ROUND_ORDER,
  totals,
  type MatchState,
  type ObservedRound,
  type RoundRecord,
} from "./match";
import { createRound, type RoundEvent, type SideState } from "./round";

const PUZZLES = loadSnapshot();
const rng = seeded(7);
const correct = (points: number, reveal = 1): SideState => ({ kind: "correct", reveal, points });
const wrong: SideState = { kind: "wrong", reveal: 1, timedOut: false };
const noBuzz: SideState = { kind: "no-buzz" };

/** Plays a finished round straight into the match (bypassing timers). */
function finish(
  match: MatchState,
  player: SideState,
  bot: SideState,
  extra: Partial<RoundRecord> = {},
): MatchState {
  const record: RoundRecord = {
    puzzle: match.current,
    suddenDeath: match.suddenDeath,
    player,
    bot,
    playerBuzzMs: null,
    botBuzzMs: null,
    firstCorrect: null,
    ...extra,
  };
  return { ...match, rounds: [...match.rounds, record], status: "round-result" };
}

function playRegular(results: [SideState, SideState][]): MatchState {
  let m = createMatch(buildSchedule(PUZZLES, rng));
  for (const [player, bot] of results) m = advance(finish(m, player, bot), PUZZLES, rng);
  return m;
}

describe("schedule (§5)", () => {
  it("plays one puzzle of each type in the GDD order", () => {
    expect(buildSchedule(PUZZLES, rng).map((p) => p.type)).toEqual(ROUND_ORDER);
  });

  it("draws from the whole published pool of each type", () => {
    const draw = seeded(3);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) buildSchedule(PUZZLES, draw).forEach((p) => seen.add(p.id));
    expect(seen).toEqual(new Set(PUZZLES.filter((p) => p.status === "published").map((p) => p.id)));
  });

  it("fails loudly when a type has no published puzzle", () => {
    expect(() => buildSchedule([careerPuzzle], rng)).toThrow(/goal_map/);
  });
});

describe("match flow", () => {
  it("advances through the 5 rounds in order", () => {
    let m = createMatch(buildSchedule(PUZZLES, rng));
    const seen = [m.current.type];
    for (let i = 0; i < 4; i++) {
      m = advance(finish(m, noBuzz, noBuzz), PUZZLES, rng);
      seen.push(m.current.type);
    }
    expect(seen).toEqual(ROUND_ORDER);
    expect(m.status).toBe("playing");
  });

  it("declares the higher total the winner after round 5", () => {
    const m = playRegular([
      [correct(800), wrong],
      [noBuzz, correct(1000)],
      [correct(600), correct(400)],
      [correct(800), correct(600)],
      [correct(600), correct(1000)],
    ]);
    expect(totals(m.rounds)).toEqual({ player: 2800, bot: 3000 });
    expect(m).toMatchObject({ status: "over", winner: "bot" });
  });
});

describe("sudden death (§12.1)", () => {
  const tied = () => playRegular(Array.from({ length: 5 }, () => [correct(600), correct(600)]));

  it("starts a sudden death round on a tie", () => {
    const m = tied();
    expect(m).toMatchObject({ status: "playing", suddenDeath: true, winner: null });
    expect(decidedWinner(m)).toBeNull();
  });

  it("gives the match to the first correct answer and adds no points", () => {
    const m = advance(finish(tied(), wrong, correct(800), { firstCorrect: "bot" }), PUZZLES, rng);
    expect(m).toMatchObject({ status: "over", winner: "bot" });
    expect(totals(m.rounds)).toEqual({ player: 3000, bot: 3000 });
  });

  it("keeps playing sudden death rounds until someone is right", () => {
    let m = advance(finish(tied(), wrong, noBuzz), PUZZLES, rng);
    expect(m).toMatchObject({ status: "playing", suddenDeath: true });
    m = advance(finish(m, correct(1000), noBuzz, { firstCorrect: "player" }), PUZZLES, rng);
    expect(m).toMatchObject({ status: "over", winner: "player" });
  });

  it("prefers a puzzle not played yet, then falls back to the whole pool", () => {
    // A 5-puzzle pool keeps this independent of how much content src/data holds.
    const pool = buildSchedule(PUZZLES, rng);
    const records = pool.slice(0, 4).map((puzzle) => ({ puzzle }) as RoundRecord);
    expect(pickSuddenDeathPuzzle(pool, records, rng)).toBe(pool[4]);

    const all = pool.map((puzzle) => ({ puzzle }) as RoundRecord);
    expect(pool).toContain(pickSuddenDeathPuzzle(pool, all, rng));
  });
});

describe("observedRoundReducer", () => {
  const botPlan: BotPlan = { buzzReveal: 2, buzzAtMs: 4000, answerDelayMs: 2000, correct: true };

  function run(s: ObservedRound, ms: number, step = 100): ObservedRound {
    for (let t = 0; t < ms; t += step) s = observedRoundReducer(s, { type: "tick", dtMs: step });
    return s;
  }
  const send = (s: ObservedRound, ...events: RoundEvent[]) => events.reduce(observedRoundReducer, s);

  it("records buzz times and who was right first", () => {
    let s = run(observeRound(createRound(careerPuzzle, botPlan)), 6100);
    expect(s.botBuzzMs).toBe(4000);
    expect(s.firstCorrect).toBe("bot");

    s = send(s, { type: "buzz" }, { type: "submit", text: "ibra" });
    expect(s.playerBuzzMs).toBe(s.round.clockMs);
    expect(s.firstCorrect).toBe("bot");
  });

  it("ends a sudden death round at the first correct answer, a regular one only when the engine does", () => {
    const s = run(observeRound(createRound(careerPuzzle, botPlan)), 6100);
    expect(s.round.over).toBe(false);
    expect(isRoundFinished(s, false)).toBe(false);
    expect(isRoundFinished(s, true)).toBe(true);
  });
});

describe("playerStats (§12)", () => {
  it("summarises correct answers, buzz times and the best round", () => {
    const m0 = createMatch(buildSchedule(PUZZLES, rng));
    let m = finish(m0, correct(600, 3), wrong, { playerBuzzMs: 7000 });
    m = advance(m, PUZZLES, rng);
    m = finish(m, correct(1000, 1), wrong, { playerBuzzMs: 1000 });
    m = advance(m, PUZZLES, rng);
    m = finish(m, wrong, wrong, { playerBuzzMs: 4000 });

    expect(playerStats(m)).toEqual({
      correct: 2,
      rounds: 3,
      averageBuzzMs: 4000,
      bestRound: { puzzle: m0.schedule[1], points: 1000 },
      fastestCorrectMs: 1000,
    });
  });
});
