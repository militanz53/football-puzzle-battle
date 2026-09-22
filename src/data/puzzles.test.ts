import { describe, expect, it } from "vitest";
import { isCorrectAnswer } from "@/game/answer";
import { ROUND_ORDER } from "@/game/match";
import { REVEAL_COUNT } from "@/game/scoring";
import type { Puzzle } from "@/game/types";
import { PUZZLES } from "./puzzles";

/** Content checks, so a malformed puzzle record fails here and not mid-match. */

function revealCapacity(p: Puzzle): number {
  switch (p.type) {
    case "career_journey":
      return p.reveal_data.clubs.length;
    case "goal_map":
      return p.reveal_data.clues.length + 1; // reveal 1 is the move itself
    case "photo_reveal":
      return p.reveal_data.stage_labels.length;
    case "missing_xi":
      return p.reveal_data.clues.length;
    case "teammate_web":
      return p.reveal_data.players.length - 1; // reveal 1 shows two players
  }
}

describe("puzzle pool", () => {
  it("has at least one published puzzle of every type", () => {
    for (const type of ROUND_ORDER) {
      expect(PUZZLES.some((p) => p.type === type && p.status === "published")).toBe(true);
    }
  });

  it("uses unique ids", () => {
    expect(new Set(PUZZLES.map((p) => p.id)).size).toBe(PUZZLES.length);
  });

  describe.each(ROUND_ORDER)("%s pool (§30)", (type) => {
    const ofType = PUZZLES.filter((p) => p.type === type);
    const count = (d: Puzzle["difficulty"]) => ofType.filter((p) => p.difficulty === d).length;

    it("has 10 puzzles", () => {
      expect(ofType).toHaveLength(10);
    });

    it("is balanced at 3 easy / 4 medium / 3 hard", () => {
      expect([count("easy"), count("medium"), count("hard")]).toEqual([3, 4, 3]);
    });
  });

  it("does not accept the same answer twice within a type", () => {
    for (const type of ROUND_ORDER) {
      const answers = PUZZLES.filter((p) => p.type === type).map((p) => p.correct_answer);
      expect(new Set(answers).size).toBe(answers.length);
    }
  });

  it("never shows the answer among a Teammate Web's own players", () => {
    for (const p of PUZZLES) {
      if (p.type !== "teammate_web") continue;
      for (const name of p.reveal_data.players) expect(isCorrectAnswer(name, p)).toBe(false);
    }
  });

  it("gives Missing XI players unique names (they are used as keys)", () => {
    for (const p of PUZZLES) {
      if (p.type !== "missing_xi") continue;
      const names = p.reveal_data.lineup.map((s) => s.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  describe.each(PUZZLES.map((p) => [p.id, p] as const))("%s", (_id, p) => {
    it("has enough content for all 5 reveals", () => {
      expect(revealCapacity(p)).toBeGreaterThanOrEqual(REVEAL_COUNT);
    });

    it("uses the MVP reveal interval of 3 s (§6.1)", () => {
      expect(p.reveal_interval_seconds).toBe(3);
    });

    it("accepts its own answer and every alias (§26.1)", () => {
      for (const answer of [p.correct_answer, ...p.answer_aliases]) {
        expect(isCorrectAnswer(answer, p)).toBe(true);
      }
    });
  });

  it("uses illustrations only for Photo Reveal (§9.2.1)", () => {
    for (const p of PUZZLES) {
      if (p.type === "photo_reveal") expect(p.image_source).toBe("illustration");
    }
  });

  it("gives every Missing XI exactly 11 players with one missing", () => {
    for (const p of PUZZLES) {
      if (p.type !== "missing_xi") continue;
      expect(p.reveal_data.lineup).toHaveLength(11);
      expect(p.reveal_data.lineup.filter((s) => s.missing)).toHaveLength(1);
    }
  });
});
