import { describe, expect, it } from "vitest";
import { careerPuzzle } from "./__fixtures__/careerPuzzle";
import type { BotPlan } from "./bot";
import {
  ANSWER_WINDOW_MS,
  createRound,
  revealStage,
  roundReducer,
  type RoundEvent,
  type RoundState,
} from "./round";

const idleBot: BotPlan = { buzzReveal: 5, buzzAtMs: 99_000, answerDelayMs: 2000, correct: true };

const fresh = (plan: BotPlan = idleBot) => createRound(careerPuzzle, plan);

function run(state: RoundState, ms: number, step = 100): RoundState {
  let s = state;
  for (let t = 0; t < ms; t += step) s = roundReducer(s, { type: "tick", dtMs: step });
  return s;
}

const send = (s: RoundState, ...events: RoundEvent[]) => events.reduce(roundReducer, s);
const buzz: RoundEvent = { type: "buzz" };
const submit = (text: string): RoundEvent => ({ type: "submit", text });

describe("reveals (§6.1)", () => {
  it("shows reveal 1 at start and opens one more every 3 s", () => {
    const stages = [0, 2900, 3000, 6000, 9000, 12000].map((ms) => revealStage(run(fresh(), ms)));
    expect(stages).toEqual([1, 1, 2, 3, 4, 5]);
  });

  it("ends unanswered after the 15 s window", () => {
    const s = run(fresh(), 15_000);
    expect(s.over).toBe(true);
    expect(s.player.kind).toBe("no-buzz");
  });
});

describe("scoring (§8)", () => {
  it("pays 1000/800/600/400/200 for a correct answer at reveal 1-5", () => {
    const points = [0, 3000, 6000, 9000, 12000].map((ms) => {
      const s = send(run(fresh(), ms), buzz, submit("ibra"));
      return s.player.kind === "correct" ? s.player.points : null;
    });
    expect(points).toEqual([1000, 800, 600, 400, 200]);
  });

  it("gives nothing for a wrong answer and allows no second buzz", () => {
    const s = send(fresh(), buzz, submit("Messi"));
    expect(s.player).toMatchObject({ kind: "wrong", timedOut: false, answer: "Messi" });
    expect(roundReducer(s, buzz).answering).toBeNull();
  });
});

describe("buzz and answer window (§7)", () => {
  it("freezes reveals while the player answers, then resumes", () => {
    const buzzed = roundReducer(run(fresh(), 3500), buzz);
    const frozen = run(buzzed, ANSWER_WINDOW_MS - 1000);
    expect(frozen.clockMs).toBe(buzzed.clockMs);
    expect(frozen.answering).toBe("player");

    const resumed = run(roundReducer(frozen, submit("x")), 200);
    expect(resumed.clockMs).toBeGreaterThan(buzzed.clockMs);
  });

  it("treats running out of the 8 s window as a wrong answer", () => {
    const s = run(roundReducer(fresh(), buzz), ANSWER_WINDOW_MS);
    expect(s.player).toMatchObject({ kind: "wrong", timedOut: true });
  });
});

describe("bot opponent (§29.1)", () => {
  const plan: BotPlan = { buzzReveal: 3, buzzAtMs: 7000, answerDelayMs: 2000, correct: true };

  it("buzzes at its planned time and blocks the player while answering", () => {
    const s = run(fresh(plan), 7100);
    expect(s.answering).toBe("bot");
    expect(s.clockMs).toBe(7000);
    expect(roundReducer(s, buzz).answering).toBe("bot");
  });

  it("answers after its delay; both sides can score in the same round", () => {
    let s = run(run(fresh(plan), 7100), 2000);
    expect(s.bot).toEqual({ kind: "correct", reveal: 3, points: 600 });
    expect(s.over).toBe(false);

    s = send(s, buzz, submit("zlatan"));
    expect(s.player).toMatchObject({ kind: "correct", points: 600 });
    expect(s.over).toBe(true);
  });
});
