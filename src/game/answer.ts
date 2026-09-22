import type { Puzzle } from "./types";

// Letters that Unicode NFD does not split into base letter + accent.
const FOLD: Record<string, string> = {
  ı: "i",
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  đ: "d",
  ł: "l",
  þ: "th",
};

/**
 * GDD §26.1 normalization: case-insensitive, accents stripped, whitespace
 * collapsed. "  ZLATAN  İbrahimović " -> "zlatan ibrahimovic".
 * Typo tolerance (fuzzy matching) is deliberately out of scope until Phase 2.
 */
export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[ıøæœßđłþ]/g, (c) => FOLD[c])
    .replace(/\s+/g, " ")
    .trim();
}

/** Exact match of the normalized input against the answer or any alias. */
export function isCorrectAnswer(input: string, puzzle: Puzzle): boolean {
  const guess = normalizeAnswer(input);
  if (guess === "") return false;
  return [puzzle.correct_answer, ...puzzle.answer_aliases].some(
    (accepted) => normalizeAnswer(accepted) === guess,
  );
}
