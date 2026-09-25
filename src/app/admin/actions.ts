"use server";

import { revalidatePath } from "next/cache";
import { loadPuzzles, savePuzzles } from "@/data/puzzles";
import {
  checkAgainstPool,
  checkPublishedCoverage,
  type Issue,
  publishDrafts,
  validateBatch,
  validatePuzzle,
} from "@/data/schema";

// Admin writes to src/data/puzzles.json. There is no login in the MVP (§29), so the
// panel is only unlisted. Every function re-validates on the server: what the
// browser checked is never trusted as-is.

export type SaveResult = { ok: true; id: string } | { ok: false; issues: Issue[] };

/** Creates a puzzle, or replaces `replacing` (its id before the edit). */
export async function savePuzzle(raw: unknown, replacing: string | null): Promise<SaveResult> {
  const result = validatePuzzle(raw);
  if (!result.ok) return result;
  const pool = loadPuzzles();
  if (replacing !== null && !pool.some((p) => p.id === replacing)) {
    return { ok: false, issues: [{ path: "", message: `${replacing} no longer exists` }] };
  }
  const issues = checkAgainstPool(result.puzzle, pool, replacing ?? undefined);
  if (issues.length > 0) return { ok: false, issues };

  const next = replacing === null
    ? [...pool, result.puzzle]
    : pool.map((p) => (p.id === replacing ? result.puzzle : p));
  savePuzzles(next);
  revalidatePath("/admin", "layout");
  return { ok: true, id: result.puzzle.id };
}

export async function deletePuzzle(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const pool = loadPuzzles();
  const next = pool.filter((p) => p.id !== id);
  if (next.length === pool.length) return { ok: false, message: `${id} no longer exists` };
  const issues = checkPublishedCoverage(next);
  if (issues.length > 0) return { ok: false, message: `Cannot delete ${id}: ${issues[0].message}.` };
  savePuzzles(next);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export type ImportSaveResult =
  | { ok: true; ids: string[] }
  | { ok: false; problems: { index: number; issues: Issue[] }[] };

/** Adds a batch all-or-nothing, after checking it again against the current pool. */
export async function importPuzzles(raw: unknown[]): Promise<ImportSaveResult> {
  const pool = loadPuzzles();
  const items = validateBatch(raw, pool);
  const problems = items.filter((i) => !i.puzzle).map((i) => ({ index: i.index, issues: i.issues }));
  if (problems.length > 0) return { ok: false, problems };
  const added = items.map((i) => i.puzzle!);
  savePuzzles([...pool, ...added]);
  revalidatePath("/admin", "layout");
  return { ok: true, ids: added.map((p) => p.id) };
}

/** Publishes the selected drafts in one write (the review step after a bulk import). */
export async function publishPuzzles(ids: string[]): Promise<{ published: string[] }> {
  const { pool, published } = publishDrafts(loadPuzzles(), ids);
  if (published.length > 0) {
    savePuzzles(pool);
    revalidatePath("/admin", "layout");
  }
  return { published };
}
