import { describe, expect, it } from "vitest";
import { isCorrectAnswer, normalizeAnswer } from "@/game/answer";
import { careerPuzzle } from "@/game/__fixtures__/careerPuzzle";
import { buildNameIndex, MAX_SUGGESTIONS, suggestNames } from "./names";
import PLAYER_NAMES from "./player-names.json";
import { loadSnapshot } from "@/test/snapshot";

const POOL = loadSnapshot();
const INDEX = buildNameIndex(POOL);
const NAMES = INDEX.map((e) => e.name);

describe("player-names.json", () => {
  it("has a few hundred clean, unique names in sorted order", () => {
    expect(PLAYER_NAMES.length).toBeGreaterThanOrEqual(300);
    for (const n of PLAYER_NAMES) expect(n).toBe(n.trim().replace(/\s+/g, " "));
    expect(new Set(PLAYER_NAMES.map(normalizeAnswer)).size).toBe(PLAYER_NAMES.length);
    expect(PLAYER_NAMES).toEqual([...PLAYER_NAMES].sort((a, b) => a.localeCompare(b, "en")));
  });
});

describe("name index", () => {
  it("mixes the pool answers into a much larger list", () => {
    const answers = new Set(POOL.map((p) => normalizeAnswer(p.correct_answer)));
    expect(INDEX.length).toBeGreaterThan(answers.size * 5);
  });

  it("offers every puzzle's answer when its full name is typed", () => {
    for (const p of POOL) expect(suggestNames(INDEX, p.correct_answer)).toContain(p.correct_answer);
  });

  it("finds every puzzle's answer from its last name", () => {
    for (const p of POOL) {
      const last = p.correct_answer.split(" ").at(-1)!;
      expect(suggestNames(INDEX, last), p.id).toContain(p.correct_answer);
    }
  });

  // The trap this prevents: the list says "Kun Agüero", the puzzle says "Sergio Agüero",
  // and both would be offered. Every name a puzzle accepts must be that puzzle's own answer.
  it("never offers a second spelling of a pool answer", () => {
    for (const name of NAMES) {
      for (const p of POOL) {
        if (isCorrectAnswer(name, p)) expect(normalizeAnswer(name), `${name} vs ${p.id}`).toBe(normalizeAnswer(p.correct_answer));
      }
    }
  });

  it("drops a list name the pool already covers under another spelling", () => {
    const index = buildNameIndex([careerPuzzle], ["Ibra", "Zlatan Ibrahimovic", "Kaká"]);
    expect(index.map((e) => e.name)).toEqual(["Zlatan Ibrahimović", "Kaká"]);
  });
});

describe("suggestNames", () => {
  it("waits for two letters", () => {
    expect(suggestNames(INDEX, "m")).toEqual([]);
    expect(suggestNames(INDEX, "  ")).toEqual([]);
  });

  it(`shows at most ${MAX_SUGGESTIONS}`, () => {
    expect(suggestNames(INDEX, "ma").length).toBe(MAX_SUGGESTIONS);
  });

  it("ignores case and accents (§26.1)", () => {
    expect(suggestNames(INDEX, "GUNDO")).toContain("İlkay Gündoğan");
    expect(suggestNames(INDEX, "solskj")).toContain("Ole Gunnar Solskjær");
    expect(suggestNames(INDEX, "cakir")).toContain("Uğurcan Çakır");
  });

  it("ranks full-name matches, then surnames, then other words", () => {
    const ronaldo = suggestNames(INDEX, "ronaldo");
    expect(ronaldo[0]).toBe("Ronaldo Nazário");
    expect(ronaldo).toContain("Cristiano Ronaldo");
    expect(ronaldo.indexOf("Ronaldo Nazário")).toBeLessThan(ronaldo.indexOf("Cristiano Ronaldo"));
  });

  it("finds pool answers by their aliases", () => {
    expect(suggestNames(INDEX, "cr7")).toEqual(["Cristiano Ronaldo"]);
    expect(suggestNames(INDEX, "pistolero")).toEqual(["Luis Suárez"]);
  });
});
