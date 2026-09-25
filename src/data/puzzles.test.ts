import { describe, expect, it } from "vitest";
import { careerPuzzle } from "@/game/__fixtures__/careerPuzzle";
import { buildSchedule, ROUND_ORDER } from "@/game/match";
import type { Puzzle } from "@/game/types";
import { seeded } from "@/game/__fixtures__/seeded";
import { fakeSupabase, fakeTable } from "@/test/fakeSupabase";
import { loadSnapshot } from "@/test/snapshot";
import {
  deletePuzzleRow,
  fetchAllPuzzles,
  fetchPublishedPuzzles,
  insertPuzzleRows,
  PuzzleStoreError,
  publishPuzzleRows,
  updatePuzzleRow,
} from "./puzzles";
import { puzzleToRow } from "./rows";

// The Supabase-backed store, against an in-memory table (src/test/fakeSupabase.ts)
// that mimics the table's Row Level Security. No network.

const SNAPSHOT = loadSnapshot();
const draft = (id: string, answer = id): Puzzle => ({ ...careerPuzzle, id, correct_answer: answer, status: "draft" });
const seededTable = (extra: Puzzle[] = []) =>
  fakeTable([...SNAPSHOT, ...extra].map((p) => ({ ...puzzleToRow(p), created_at: "2026-09-25T00:00:00Z", updated_at: "2026-09-25T00:00:00Z" })));

describe("reading", () => {
  it("gives the game the published puzzles only, exactly as seeded, in §5 order", async () => {
    const table = seededTable([draft("career_900")]);
    const pool = await fetchPublishedPuzzles(fakeSupabase(table, "public"));
    expect(pool).toHaveLength(SNAPSHOT.length);
    expect(pool.map((p) => p.id)).not.toContain("career_900");
    expect(pool).toEqual(
      [...SNAPSHOT].sort((a, b) => ROUND_ORDER.indexOf(a.type) - ROUND_ORDER.indexOf(b.type) || a.id.localeCompare(b.id)),
    );
    expect(table.log).toEqual([{ role: "public", op: "select", filters: ["status=published"] }]);
  });

  it("still keeps drafts out of matches if the query forgot its filter (RLS)", async () => {
    const table = seededTable([draft("career_900")]);
    const everything = await fetchAllPuzzles(fakeSupabase(table, "public"));
    expect(everything.every((p) => p.status === "published")).toBe(true);
  });

  it("gives the admin drafts too", async () => {
    const pool = await fetchAllPuzzles(fakeSupabase(seededTable([draft("career_900")]), "secret"));
    expect(pool.find((p) => p.id === "career_900")?.status).toBe("draft");
  });

  it("builds a match from what it reads", async () => {
    const pool = await fetchPublishedPuzzles(fakeSupabase(seededTable(), "public"));
    expect(buildSchedule(pool, seeded(3)).map((p) => p.type)).toEqual(ROUND_ORDER);
  });

  it("pages past PostgREST's 1000-row limit", async () => {
    const many = Array.from({ length: 1234 }, (_, i) => draft(`career_${String(i + 1000).padStart(4, "0")}`));
    const table = fakeTable(many.map(puzzleToRow));
    expect(await fetchAllPuzzles(fakeSupabase(table, "secret"))).toHaveLength(1234);
    expect(table.log).toHaveLength(2);
  });

  it("turns a database error into a readable one", async () => {
    const table = seededTable();
    table.failNext = { code: "PGRST301", message: "JWT expired" };
    const failure = fetchAllPuzzles(fakeSupabase(table, "secret"));
    await expect(failure).rejects.toBeInstanceOf(PuzzleStoreError);
    await expect(failure).rejects.toThrow("Could not load puzzles: JWT expired (PGRST301)");
  });
});

describe("writing (secret key)", () => {
  it("inserts a batch, stored as rows with NULL for absent fields", async () => {
    const table = fakeTable();
    await insertPuzzleRows([draft("a1"), draft("a2")], fakeSupabase(table, "secret"));
    expect(table.rows.map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(table.rows[0]).toMatchObject({ competition: null, season: null, image_source: null, license_type: null });
  });

  it("inserts all or nothing when one id is taken", async () => {
    const table = fakeTable([puzzleToRow(draft("a1"))]);
    await expect(insertPuzzleRows([draft("a2"), draft("a1")], fakeSupabase(table, "secret"))).rejects.toThrow(/23505/);
    expect(table.rows.map((r) => r.id)).toEqual(["a1"]);
  });

  it("updates in place, including a changed id, and reports a missing row", async () => {
    const table = fakeTable([puzzleToRow(draft("a1"))]);
    const db = fakeSupabase(table, "secret");
    expect(await updatePuzzleRow("a1", { ...draft("a9"), question: "Who?" }, db)).toBe(true);
    expect(table.rows).toEqual([expect.objectContaining({ id: "a9", question: "Who?" })]);
    expect(await updatePuzzleRow("gone", draft("gone"), db)).toBe(false);
  });

  it("deletes by id and reports a missing row", async () => {
    const table = fakeTable([puzzleToRow(draft("a1")), puzzleToRow(draft("a2"))]);
    const db = fakeSupabase(table, "secret");
    expect(await deletePuzzleRow("a1", db)).toBe(true);
    expect(await deletePuzzleRow("a1", db)).toBe(false);
    expect(table.rows.map((r) => r.id)).toEqual(["a2"]);
  });

  it("publishes only the chosen drafts", async () => {
    const table = fakeTable([careerPuzzle, draft("d1"), draft("d2"), draft("d3")].map(puzzleToRow));
    const published = await publishPuzzleRows(["d3", "d1", "test_career", "gone"], fakeSupabase(table, "secret"));
    expect(published).toEqual(["d1", "d3"]);
    expect(table.rows.map((r) => [r.id, r.status])).toEqual([
      ["test_career", "published"],
      ["d1", "published"],
      ["d2", "draft"],
      ["d3", "published"],
    ]);
  });
});

// The live version of these checks, against the real table, is in
// src/lib/supabase/connection.integration.test.ts.
describe("the publishable key cannot write", () => {
  it("is refused on insert, update, publish and delete, and nothing changes", async () => {
    const table = fakeTable([careerPuzzle, draft("d1")].map(puzzleToRow));
    const before = structuredClone(table.rows);
    const db = fakeSupabase(table, "public");
    const denied = /permission denied.*42501/;
    await expect(insertPuzzleRows([draft("a1")], db)).rejects.toThrow(denied);
    await expect(updatePuzzleRow("test_career", { ...careerPuzzle, question: "Hacked?" }, db)).rejects.toThrow(denied);
    await expect(publishPuzzleRows(["d1"], db)).rejects.toThrow(denied);
    await expect(deletePuzzleRow("test_career", db)).rejects.toThrow(denied);
    expect(table.rows).toEqual(before);
  });
});
