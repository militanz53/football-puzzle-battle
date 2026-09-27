import { describe, expect, it } from "vitest";
import { careerPuzzle } from "@/game/__fixtures__/careerPuzzle";
import { seeded } from "@/game/__fixtures__/seeded";
import { GHOST_RATING_SPREAD, ghostRating, isRanked, needsSettling, rankedResult } from "./ranked";
import { abandonSolo, newMatchRecord, type MatchRecord, type Players } from "./service";

const RANKED: Players = {
  a: { session: "sa", name: "Kadir", account: { userId: "user-a", rating: 1200 } },
  b: { session: "sb", name: "Deniz", account: { userId: "user-b", rating: 1200 } },
  since: 0,
};

function finished(players: Players | null, winner: "player" | "bot", mode: MatchRecord["mode"] = "ranked"): MatchRecord {
  const record = { id: "m1", mode, ...newMatchRecord([careerPuzzle], "Deniz", players) };
  return { ...record, match: { ...record.match, status: "over", winner } };
}

describe("ranked results", () => {
  it("knows a ranked match by its mode, with an account in both seats", () => {
    expect(isRanked(finished(RANKED, "player"))).toBe(true);
    expect(isRanked(finished(RANKED, "player", "friendly"))).toBe(false); // two accounts, but friendly
    expect(needsSettling(finished(RANKED, "player", "friendly"))).toBe(false);
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

describe("ranked against the bot", () => {
  const SOLO = { userId: "user-a", username: "Kadir", rating: 1300, opponentRating: 1340 };
  const soloMatch = (winner: "player" | "bot"): MatchRecord => {
    const record = { id: "m2", mode: "ranked" as const, ...newMatchRecord([careerPuzzle], "Oğuz1989", null), rankedSolo: SOLO };
    return { ...record, match: { ...record.match, status: "over", winner } };
  };

  it("gives the bot a ghost rating within ±50 of the player's, never a fixed one", () => {
    expect(GHOST_RATING_SPREAD).toBe(50);
    const rng = seeded(11);
    const ratings = Array.from({ length: 500 }, () => ghostRating(1500, rng));
    expect(Math.min(...ratings)).toBeGreaterThanOrEqual(1450);
    expect(Math.max(...ratings)).toBeLessThanOrEqual(1550);
    expect(new Set(ratings).size).toBeGreaterThan(60); // spread over the range
    expect(ratings).toContain(1450);
    expect(ratings).toContain(1550);
  });

  it("never gives the bot a rating below 0", () => {
    const rng = seeded(3);
    for (let i = 0; i < 200; i++) expect(ghostRating(10, rng)).toBeGreaterThanOrEqual(0);
  });

  it("counts as ranked with one account", () => {
    expect(isRanked(soloMatch("player"))).toBe(true);
    expect(isRanked({ ...soloMatch("player"), mode: "quick" })).toBe(false);
  });

  it("moves the player by Elo against the ghost rating", () => {
    // 1300 vs 1340: a win is worth round(32 × (1 − 1/(1 + 10^(40/400)))) = 18.
    expect(rankedResult(soloMatch("player"))?.a).toEqual({ before: 1300, after: 1318, delta: 18 });
    expect(rankedResult(soloMatch("bot"))?.a).toEqual({ before: 1300, after: 1286, delta: -14 });
  });

  it("ends an abandoned match as a loss, once", () => {
    const record = { ...soloMatch("player"), match: { ...soloMatch("player").match, status: "playing" as const, winner: null } };
    const left = abandonSolo(record);
    expect(left.changed).toBe(true);
    expect(left.record.match).toMatchObject({ status: "over", winner: "bot" });
    expect(left.record.ended).toEqual({ reason: "left", seat: "a" });
    expect(abandonSolo(left.record).changed).toBe(false);
    expect(abandonSolo({ ...record, rankedSolo: null }).changed).toBe(false); // Quick Match bot matches are never touched
  });
});
