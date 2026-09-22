import { describe, expect, it } from "vitest";
import { planBotTurn, type Rng } from "./bot";
import { seeded } from "./__fixtures__/seeded";

function sample(n: number, ...args: Parameters<typeof planBotTurn>) {
  return Array.from({ length: n }, () => planBotTurn(...args));
}

describe("planBotTurn (§29.1)", () => {
  const N = 20_000;

  it("medium bot buzzes in reveals 2-4, weighted toward 3 on a medium puzzle", () => {
    const plans = sample(N, "medium", "medium", 3000, seeded(1));
    const share = (r: number) => plans.filter((p) => p.buzzReveal === r).length / N;
    expect(new Set(plans.map((p) => p.buzzReveal))).toEqual(new Set([2, 3, 4]));
    expect(share(2)).toBeCloseTo(0.25, 1);
    expect(share(3)).toBeCloseTo(0.5, 1);
    expect(share(4)).toBeCloseTo(0.25, 1);
  });

  it("medium bot leans earlier on easy puzzles and later on hard ones", () => {
    const early = (d: "easy" | "hard", rng: Rng) =>
      sample(N, "medium", d, 3000, rng).filter((p) => p.buzzReveal === 2).length;
    expect(early("easy", seeded(2))).toBeGreaterThan(early("hard", seeded(2)));
  });

  it("medium bot is right about 70% of the time", () => {
    const plans = sample(N, "medium", "medium", 3000, seeded(3));
    expect(plans.filter((p) => p.correct).length / N).toBeCloseTo(0.7, 1);
  });

  it("buzz time falls inside the chosen reveal stage", () => {
    for (const p of sample(2000, "medium", "medium", 3000, seeded(4))) {
      expect(Math.floor(p.buzzAtMs / 3000) + 1).toBe(p.buzzReveal);
    }
  });

  it("answer delay is 1.5-3 s", () => {
    for (const p of sample(2000, "medium", "medium", 3000, seeded(5))) {
      expect(p.answerDelayMs).toBeGreaterThanOrEqual(1500);
      expect(p.answerDelayMs).toBeLessThanOrEqual(3000);
    }
  });

  it("easy and hard bots use their own reveal ranges", () => {
    const reveals = (d: "easy" | "hard") =>
      new Set(sample(2000, d, "medium", 3000, seeded(6)).map((p) => p.buzzReveal));
    expect(reveals("easy")).toEqual(new Set([4, 5]));
    expect(reveals("hard")).toEqual(new Set([1, 2, 3]));
  });
});
