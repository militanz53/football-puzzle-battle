import { describe, expect, it } from "vitest";
import { careerPuzzle } from "@/game/__fixtures__/careerPuzzle";
import { isRanked, needsSettling, rankedResult } from "./ranked";
import { newMatchRecord, type MatchRecord, type Players } from "./service";

const RANKED: Players = {
  a: { session: "sa", name: "Kadir", account: { userId: "user-a", rating: 1200 } },
  b: { session: "sb", name: "Deniz", account: { userId: "user-b", rating: 1200 } },
  since: 0,
};

function finished(players: Players | null, winner: "player" | "bot"): MatchRecord {
  const record = { id: "m1", ...newMatchRecord([careerPuzzle], "Deniz", players) };
  return { ...record, match: { ...record.match, status: "over", winner } };
}

describe("ranked results", () => {
  it("knows a ranked match by both seats having an account", () => {
    expect(isRanked(finished(RANKED, "player"))).toBe(true);
    expect(isRanked(finished(null, "player"))).toBe(false);
    const quick = { a: { session: "sa", name: "A_1" }, b: { session: "sb", name: "B_2" }, since: 0 };
    expect(isRanked(finished(quick, "player"))).toBe(false);
  });

  it("gives seat a the win when the engine's player side won", () => {
    expect(rankedResult(finished(RANKED, "player"))).toEqual({
      a: { before: 1200, after: 1216, delta: 16 },
      b: { before: 1200, after: 1184, delta: -16 },
    });
  });

  it("gives seat b the win when the engine's opponent side won", () => {
    expect(rankedResult(finished(RANKED, "bot"))).toEqual({
      a: { before: 1200, after: 1184, delta: -16 },
      b: { before: 1200, after: 1216, delta: 16 },
    });
  });

  it("settles only a finished ranked match, and only once", () => {
    const over = finished(RANKED, "player");
    expect(needsSettling(over)).toBe(true);
    expect(needsSettling({ ...over, rankedResult: rankedResult(over) })).toBe(false);
    expect(needsSettling({ ...over, match: { ...over.match, status: "playing", winner: null } })).toBe(false);
    expect(needsSettling(finished(null, "player"))).toBe(false);
  });
});
