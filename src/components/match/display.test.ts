import { describe, expect, it } from "vitest";
import { careerPuzzle } from "@/game/__fixtures__/careerPuzzle";
import type { MatchView, PublicRound } from "@/server/match/view";
import { displayStage, isNewer, notStartedRound, optimisticBuzz, projectRound } from "./display";

// The browser only draws the server's round between updates; these are the rules.

const fresh = notStartedRound(careerPuzzle);
const at = (clockMs: number, patch: Partial<PublicRound> = {}): PublicRound => ({ ...fresh, clockMs, ...patch });

describe("projectRound", () => {
  it("runs the reveal clock on between server updates", () => {
    expect(projectRound(at(2_500), 1_000, null).clockMs).toBe(3_500);
    expect(displayStage(projectRound(at(2_500), 1_000, null))).toBe(2);
  });

  it("never runs past the next change the server announced", () => {
    expect(projectRound(at(2_500), 5_000, 1_200).clockMs).toBe(3_700);
  });

  it("stops at the end of the reveal window", () => {
    expect(projectRound(at(14_000), 5_000, null).clockMs).toBe(15_000);
  });

  it("holds the reveal clock while someone answers, running the answer timer instead", () => {
    const answering = at(4_000, { answering: "player", answerMs: 1_000, player: { kind: "answering", reveal: 2 } });
    const later = projectRound(answering, 2_000, 7_000);
    expect(later.clockMs).toBe(4_000);
    expect(later.answerMs).toBe(3_000);
    expect(projectRound(answering, 60_000, null).answerMs).toBe(8_000);
  });

  it("leaves a finished round alone", () => {
    const over = at(15_000, { over: true });
    expect(projectRound(over, 5_000, null)).toBe(over);
  });
});

describe("optimisticBuzz", () => {
  it("opens the answer box at once, at the clue on screen", () => {
    expect(optimisticBuzz(at(3_200))).toMatchObject({ answering: "player", answerMs: 0, player: { kind: "answering", reveal: 2 } });
  });

  it("does nothing while the bot answers, after the player is done, or once over", () => {
    expect(optimisticBuzz(at(3_200, { answering: "bot", bot: { kind: "answering", reveal: 2 } }))).toBeNull();
    expect(optimisticBuzz(at(3_200, { player: { kind: "wrong", reveal: 1, timedOut: false } }))).toBeNull();
    expect(optimisticBuzz(at(15_000, { over: true }))).toBeNull();
  });
});

describe("isNewer", () => {
  const view = (version: number, serverTime: number, id = "m1") => ({ id, version, serverTime }) as MatchView;

  it("prefers a later version, then a later server time", () => {
    expect(isNewer(view(2, 100), view(1, 900))).toBe(true);
    expect(isNewer(view(1, 900), view(2, 100))).toBe(false);
    expect(isNewer(view(1, 200), view(1, 100))).toBe(true);
    expect(isNewer(view(1, 100), view(1, 200))).toBe(false);
  });

  it("ignores a view of another match (e.g. a late reply after a rematch)", () => {
    expect(isNewer(view(9, 999, "old"), view(1, 1))).toBe(false);
  });
});
