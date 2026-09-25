"use server";

import { revalidatePath } from "next/cache";
import {
  deletePuzzleRow,
  fetchAllPuzzles,
  insertPuzzleRows,
  publishPuzzleRows,
  updatePuzzleRow,
} from "@/data/puzzles";
import { checkAgainstPool, checkPublishedCoverage, type Issue, validateBatch, validatePuzzle } from "@/data/schema";
import { requireAdmin } from "@/lib/admin/auth";

// Admin writes to the Supabase `puzzles` table with the secret key (server only).
// Every function first checks the admin session (requireAdmin): a Server Function
// can be called by a POST to any URL, so the /admin proxy alone does not cover it.
// Each also re-validates on the server: what the browser checked is never trusted.

export type SaveResult = { ok: true; id: string } | { ok: false; issues: Issue[] };

const failure = (e: unknown): Issue[] => [{ path: "", message: (e as Error).message }];

/** Creates a puzzle, or replaces `replacing` (its id before the edit). */
export async function savePuzzle(raw: unknown, replacing: string | null): Promise<SaveResult> {
  await requireAdmin();
  const result = validatePuzzle(raw);
  if (!result.ok) return result;
  try {
    const pool = await fetchAllPuzzles();
    if (replacing !== null && !pool.some((p) => p.id === replacing)) {
      return { ok: false, issues: [{ path: "", message: `${replacing} no longer exists` }] };
    }
    const issues = checkAgainstPool(result.puzzle, pool, replacing ?? undefined);
    if (issues.length > 0) return { ok: false, issues };

    if (replacing === null) await insertPuzzleRows([result.puzzle]);
    else if (!(await updatePuzzleRow(replacing, result.puzzle))) {
      return { ok: false, issues: [{ path: "", message: `${replacing} no longer exists` }] };
    }
  } catch (e) {
    return { ok: false, issues: failure(e) };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, id: result.puzzle.id };
}

export async function deletePuzzle(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireAdmin();
  try {
    const pool = await fetchAllPuzzles();
    if (!pool.some((p) => p.id === id)) return { ok: false, message: `${id} no longer exists` };
    const issues = checkPublishedCoverage(pool.filter((p) => p.id !== id));
    if (issues.length > 0) return { ok: false, message: `Cannot delete ${id}: ${issues[0].message}.` };
    if (!(await deletePuzzleRow(id))) return { ok: false, message: `${id} no longer exists` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export type ImportSaveResult =
  | { ok: true; ids: string[] }
  | { ok: false; problems: { index: number; issues: Issue[] }[] };

/** Adds a batch all-or-nothing (one insert), after checking it again against the table. */
export async function importPuzzles(raw: unknown[]): Promise<ImportSaveResult> {
  await requireAdmin();
  try {
    const items = validateBatch(raw, await fetchAllPuzzles());
    const problems = items.filter((i) => !i.puzzle).map((i) => ({ index: i.index, issues: i.issues }));
    if (problems.length > 0) return { ok: false, problems };
    const added = items.map((i) => i.puzzle!);
    await insertPuzzleRows(added);
    revalidatePath("/admin", "layout");
    return { ok: true, ids: added.map((p) => p.id) };
  } catch (e) {
    return { ok: false, problems: [{ index: 0, issues: failure(e) }] };
  }
}

/** Publishes the selected drafts in one update (the review step after a bulk import). */
export async function publishPuzzles(ids: string[]): Promise<{ published: string[] }> {
  await requireAdmin();
  const published = await publishPuzzleRows(ids);
  if (published.length > 0) revalidatePath("/admin", "layout");
  return { published };
}
