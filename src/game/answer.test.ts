import { describe, expect, it } from "vitest";
import { careerPuzzle } from "./__fixtures__/careerPuzzle";
import { isCorrectAnswer, normalizeAnswer } from "./answer";

describe("normalizeAnswer (§26.1)", () => {
  it("lowercases, strips accents and collapses whitespace", () => {
    expect(normalizeAnswer("  Zlatan   IBRAHIMOVIĆ ")).toBe("zlatan ibrahimovic");
  });

  it("folds letters NFD cannot split", () => {
    expect(normalizeAnswer("Ødegaard Æ ß")).toBe("odegaard ae ss");
  });

  it("handles Turkish dotted and dotless i", () => {
    expect(normalizeAnswer("İbrahimović")).toBe("ibrahimovic");
    expect(normalizeAnswer("ıbra")).toBe("ibra");
  });
});

describe("isCorrectAnswer", () => {
  it.each([
    "Zlatan Ibrahimović",
    "zlatan ibrahimovic",
    "IBRAHIMOVIC",
    "  ibra ",
    "Zlatan",
    "İbrahimović",
    "Zlatan   Ibrahimovic",
  ])("accepts %j", (guess) => {
    expect(isCorrectAnswer(guess, careerPuzzle)).toBe(true);
  });

  it.each(["", "   ", "Ibrahimovich", "Ronaldo", "zlatan i"])(
    "rejects %j (no fuzzy matching in the MVP)",
    (guess) => {
      expect(isCorrectAnswer(guess, careerPuzzle)).toBe(false);
    },
  );
});
