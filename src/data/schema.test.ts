import { describe, expect, it } from "vitest";
import { careerPuzzle } from "@/game/__fixtures__/careerPuzzle";
import type { Puzzle } from "@/game/types";
import { checkAgainstPool, nextId, parseImport, publishDrafts, validateBatch, validatePuzzle } from "./schema";
import { EXAMPLE_IMPORT } from "./schemaGuide";

const issuesOf = (raw: unknown) => {
  const r = validatePuzzle(raw);
  return r.ok ? [] : r.issues;
};
const paths = (raw: unknown) => issuesOf(raw).map((i) => i.path);

/** The documented examples as stored records (defaults filled in). */
const examplePool = (): Puzzle[] =>
  EXAMPLE_IMPORT.map((p, i) => {
    const r = validatePuzzle({ ...p, id: `x_${i}` });
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.puzzle;
  });

const minimalCareer = {
  type: "career_journey",
  id: "career_900",
  difficulty: "easy",
  question: "Who is the player?",
  correct_answer: "Kaká",
  answer_aliases: ["Kaka"],
  reveal_data: { clubs: ["São Paulo", "AC Milan", "Real Madrid", "AC Milan", "Orlando City"] },
};

describe("validatePuzzle", () => {
  it("accepts a fixture record unchanged", () => {
    expect(validatePuzzle(careerPuzzle)).toEqual({ ok: true, puzzle: careerPuzzle });
  });

  it("fills the defaults for optional fields", () => {
    const r = validatePuzzle(minimalCareer);
    expect(r.ok && r.puzzle).toMatchObject({
      status: "published",
      bot_difficulty: "medium",
      reveal_interval_seconds: 3,
      tags: [],
    });
  });

  it("names every missing required field", () => {
    expect(paths({ type: "teammate_web" })).toEqual(
      expect.arrayContaining(["id", "difficulty", "question", "correct_answer", "answer_aliases", "reveal_data"]),
    );
  });

  it("stops at an unknown type", () => {
    expect(issuesOf({ type: "quiz" })).toEqual([{ path: "type", message: expect.stringContaining("goal_map") }]);
  });

  it("rejects unknown fields, so typos surface", () => {
    expect(paths({ ...minimalCareer, answer_alias: [] })).toEqual(["answer_alias"]);
    expect(paths({ ...minimalCareer, reveal_data: { clubs: minimalCareer.reveal_data.clubs, club: [] } })).toEqual([
      "reveal_data.club",
    ]);
  });

  it("reports wrong types with the exact path", () => {
    expect(paths({ ...minimalCareer, reveal_data: { clubs: ["A", "B", 3, "D", "E"] } })).toEqual(["reveal_data.clubs[2]"]);
    expect(paths({ ...minimalCareer, difficulty: "insane" })).toEqual(["difficulty"]);
  });

  it("requires enough content for 5 reveals", () => {
    expect(issuesOf({ ...minimalCareer, reveal_data: { clubs: ["A", "B"] } })[0].message).toMatch(/at least 5/);
  });

  it("keeps the MVP reveal interval at 3 s (§6.1)", () => {
    expect(paths({ ...minimalCareer, reveal_interval_seconds: 5 })).toEqual(["reveal_interval_seconds"]);
  });

  it("does not let a Teammate Web show its own answer", () => {
    const web = {
      ...minimalCareer,
      type: "teammate_web",
      reveal_data: { players: ["Pirlo", "Seedorf", "Kaka", "Shevchenko", "Maldini", "Nesta"] },
    };
    expect(paths(web)).toEqual(["reveal_data.players[2]"]);
  });

  it("allows only illustrations for Photo Reveal (§9.2.1)", () => {
    const photo = EXAMPLE_IMPORT.find((p) => p.type === "photo_reveal")!;
    expect(paths({ ...photo, id: "photo_900", image_source: "photo" })).toEqual(["image_source"]);
  });

  it("needs a Missing XI of 11 with exactly one missing", () => {
    const xi = EXAMPLE_IMPORT.find((p) => p.type === "missing_xi")! as Extract<Puzzle, { type: "missing_xi" }>;
    const lineup = xi.reveal_data.lineup.map((slot) => ({ ...slot, missing: undefined }));
    const issues = issuesOf({ ...xi, id: "missing_900", reveal_data: { ...xi.reveal_data, lineup } });
    expect(issues.map((i) => i.message)).toEqual([expect.stringMatching(/exactly one player/)]);
  });

  it("needs the Goal Map shot to start at an attacker", () => {
    const goal = EXAMPLE_IMPORT.find((p) => p.type === "goal_map")! as Extract<Puzzle, { type: "goal_map" }>;
    const shot = { from: [1, 1], to: goal.reveal_data.shot.to };
    expect(paths({ ...goal, id: "goal_900", reveal_data: { ...goal.reveal_data, shot } })).toEqual(["reveal_data.shot.from"]);
  });
});

describe("checkAgainstPool", () => {
  it("flags a taken id and a repeated answer within the type", () => {
    const clash = { ...careerPuzzle, correct_answer: "zlatan IBRAHIMOVIC" };
    expect(checkAgainstPool(clash, [careerPuzzle]).map((i) => i.path)).toEqual(expect.arrayContaining(["id", "correct_answer"]));
  });

  it("lets a record be saved over itself", () => {
    const pool = [...examplePool(), careerPuzzle];
    expect(checkAgainstPool({ ...careerPuzzle, question: "Who?" }, pool, careerPuzzle.id)).toEqual([]);
  });

  it("refuses to leave a type without a published puzzle", () => {
    const pool = examplePool();
    const career = pool.find((p) => p.type === "career_journey")!;
    expect(checkAgainstPool({ ...career, status: "draft" }, pool, career.id)).toEqual([
      expect.objectContaining({ path: "status" }),
    ]);
  });
});

describe("nextId", () => {
  it("continues after the highest number of that type", () => {
    expect(nextId("career_journey", ["career_001", "career_010", "goal_050"])).toBe("career_011");
    expect(nextId("goal_map", [])).toBe("goal_001");
  });
});

describe("bulk import", () => {
  it("accepts the documented example as-is", () => {
    const r = parseImport(JSON.stringify(EXAMPLE_IMPORT), []);
    expect(r.ok && r.items.map((i) => i.issues)).toEqual(EXAMPLE_IMPORT.map(() => []));
  });

  it("assigns ids that do not clash with the pool or the batch", () => {
    const items = validateBatch([minimalCareer, { ...minimalCareer, correct_answer: "Pato" }].map((p) => ({ ...p, id: undefined })), [
      careerPuzzle,
      { ...careerPuzzle, id: "career_004", correct_answer: "Someone" },
    ]);
    expect(items.map((i) => i.puzzle?.id)).toEqual(["career_005", "career_006"]);
  });

  it("reports each bad record by position, and still accepts the good ones", () => {
    const r = parseImport(JSON.stringify([minimalCareer, { type: "career_journey" }, minimalCareer]), []);
    if (!r.ok) throw new Error(r.error);
    expect(r.items.map((i) => [i.index, !!i.puzzle])).toEqual([[1, true], [2, false], [3, false]]);
    expect(r.items[2].issues.map((i) => i.path)).toEqual(expect.arrayContaining(["id", "correct_answer"]));
  });

  it("accepts a ```json fence and a { puzzles: [...] } wrapper", () => {
    const text = "```json\n" + JSON.stringify({ puzzles: [minimalCareer] }) + "\n```";
    const r = parseImport(text, []);
    expect(r.ok && r.items[0].puzzle?.id).toBe("career_900");
  });

  it("brings every imported puzzle in as a draft, even one marked published", () => {
    const items = validateBatch([minimalCareer, { ...minimalCareer, id: "career_901", correct_answer: "Pato", status: "published" }], []);
    expect(items.map((i) => i.puzzle?.status)).toEqual(["draft", "draft"]);
  });

  it("explains broken JSON", () => {
    const r = parseImport("[{ oops", []);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/Not valid JSON/);
  });
});

describe("publishDrafts", () => {
  const draft = (id: string) => ({ ...careerPuzzle, id, status: "draft" as const });

  it("publishes only the chosen drafts", () => {
    const pool = [careerPuzzle, draft("d1"), draft("d2"), draft("d3")];
    const { pool: next, published } = publishDrafts(pool, ["d1", "d3"]);
    expect(published).toEqual(["d1", "d3"]);
    expect(next.map((p) => [p.id, p.status])).toEqual([
      ["test_career", "published"],
      ["d1", "published"],
      ["d2", "draft"],
      ["d3", "published"],
    ]);
  });

  it("ignores ids that are missing or already published", () => {
    const pool = [careerPuzzle, draft("d1")];
    const { pool: next, published } = publishDrafts(pool, ["test_career", "gone"]);
    expect(published).toEqual([]);
    expect(next).toEqual(pool);
  });
});
