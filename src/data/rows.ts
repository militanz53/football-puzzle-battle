import { ROUND_ORDER } from "@/game/match";
import type { Puzzle } from "@/game/types";

// Puzzle record ↔ row of the `puzzles` table (supabase/migrations/…_create_puzzles.sql).
// The columns are the Puzzle fields themselves; the differences are that an absent
// optional field is NULL in the table, and the table adds created_at/updated_at.

export const PUZZLES_TABLE = "puzzles";

const OPTIONAL = ["competition", "season", "image_source", "license_type"] as const;

export type PuzzleRow = Omit<Puzzle, (typeof OPTIONAL)[number]> & {
  [K in (typeof OPTIONAL)[number]]: string | null;
} & { created_at?: string; updated_at?: string };

/** Every optional field is written, as NULL when absent, so an update also clears it. */
export function puzzleToRow(puzzle: Puzzle): Omit<PuzzleRow, "created_at" | "updated_at"> {
  const row: Record<string, unknown> = { ...puzzle };
  for (const key of OPTIONAL) row[key] = row[key] ?? null;
  return row as Omit<PuzzleRow, "created_at" | "updated_at">;
}

/** Drops NULLs and the timestamps, giving back exactly the record the app works with. */
export function rowToPuzzle(row: PuzzleRow): Puzzle {
  const puzzle: Record<string, unknown> = { ...row };
  delete puzzle.created_at;
  delete puzzle.updated_at;
  for (const key of OPTIONAL) if (puzzle[key] === null) delete puzzle[key];
  return puzzle as unknown as Puzzle;
}

/** §5 round order, then id: the order the admin lists and the old JSON file used. */
export function byTypeThenId(a: Puzzle, b: Puzzle): number {
  return ROUND_ORDER.indexOf(a.type) - ROUND_ORDER.indexOf(b.type) || a.id.localeCompare(b.id);
}
