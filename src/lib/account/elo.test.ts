import { describe, expect, it } from "vitest";
import { eloResult, expectedScore, K_FACTOR } from "./elo";

describe("Elo", () => {
  it("uses K = 32", () => {
    expect(K_FACTOR).toBe(32);
  });

  it("gives equal players an even chance", () => {
    expect(expectedScore(1200, 1200)).toBe(0.5);
  });

  it("gives a 400-point favourite 10:1 odds", () => {
    expect(expectedScore(1600, 1200)).toBeCloseTo(10 / 11, 10);
    expect(expectedScore(1200, 1600)).toBeCloseTo(1 / 11, 10);
  });

  it("moves equal players by K/2 each way", () => {
    expect(eloResult(1200, 1200)).toEqual({
      winner: { before: 1200, after: 1216, delta: 16 },
      loser: { before: 1200, after: 1184, delta: -16 },
    });
  });

  it("rewards an upset more than an expected win", () => {
    const upset = eloResult(1200, 1600); // the weaker player won
    const expected = eloResult(1600, 1200);
    expect(upset.winner.delta).toBe(29); // round(32 * 10/11)
    expect(expected.winner.delta).toBe(3); // round(32 * 1/11)
    expect(upset.winner.delta).toBeGreaterThan(expected.winner.delta);
  });

  it("is zero-sum", () => {
    for (const [w, l] of [
      [1200, 1200],
      [1350, 1210],
      [987, 1543],
      [2100, 1999],
    ]) {
      const { winner, loser } = eloResult(w, l);
      expect(winner.delta + loser.delta).toBe(0);
      expect(winner.delta).toBeGreaterThan(0);
    }
  });

  it("never gains more than K or less than 0", () => {
    expect(eloResult(3000, 0).winner.delta).toBe(0);
    expect(eloResult(0, 3000).winner.delta).toBe(32);
  });

  it("never takes a rating below 0, and reports the change actually made", () => {
    expect(eloResult(20, 5).loser).toEqual({ before: 5, after: 0, delta: -5 });
  });
});
