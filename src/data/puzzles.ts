import "server-only";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Puzzle } from "@/game/types";
import { getPublicSupabase } from "@/lib/supabase/public";
import { getServerSupabase } from "@/lib/supabase/server";
import { byTypeThenId, PUZZLES_TABLE, puzzleToRow, rowToPuzzle, type PuzzleRow } from "./rows";

// The puzzle table (GDD §24) in Supabase. Records keep the §24 snake_case fields,
// so the app's Puzzle type and the table's columns are the same (./rows.ts).
//
// - The game reads with the publishable key: Row Level Security returns published
//   puzzles only, so a draft can never be drawn into a match.
// - The admin panel reads and writes with the secret key (Server Functions only).
//
// Every function takes the client as a parameter so tests can pass a fake one.
// src/data/puzzles.json is the backup the table was seeded from (npm run db:seed);
// nothing at runtime reads it.
//
// Difficulty guide, adapted per type from the Career Journey tiers in §9.4:
// - Goal Map: Easy = iconic finals, Medium = famous club goals, Hard = older or group-stage goals.
// - Photo Reveal: Easy = one-of-a-kind look, Medium = well-known star, Hard = less distinctive look.
// - Missing XI: Easy = recent World Cup final + its star, Medium = famous final + key player,
//   Hard = older final + squad player.
// - Career Journey: exactly §9.4 — "Club (years)" / club names only / home cities or countries only.
// - Teammate Web: Easy = superstar connector, Medium = well-known connector, Hard = connector
//   known mainly to regular followers, across three or more clubs.

export type Db = Pick<SupabaseClient, "from">;

/** PostgREST returns at most 1000 rows per request by default. */
const PAGE = 1000;

export class PuzzleStoreError extends Error {
  constructor(action: string, readonly cause: PostgrestError) {
    super(`Could not ${action}: ${cause.message}${cause.code ? ` (${cause.code})` : ""}`);
    this.name = "PuzzleStoreError";
  }
}

async function selectAll(db: Db, onlyPublished: boolean, action: string): Promise<Puzzle[]> {
  const rows: PuzzleRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = db.from(PUZZLES_TABLE).select("*");
    if (onlyPublished) query = query.eq("status", "published");
    const { data, error } = await query.order("id").range(from, from + PAGE - 1);
    if (error) throw new PuzzleStoreError(action, error);
    rows.push(...(data as PuzzleRow[]));
    if (data.length < PAGE) break;
  }
  return rows.map(rowToPuzzle).sort(byTypeThenId);
}

/** The game's pool: published puzzles only (also enforced by RLS for this key). */
export function fetchPublishedPuzzles(db: Db = getPublicSupabase()): Promise<Puzzle[]> {
  return selectAll(db, true, "load published puzzles");
}

/** Admin: every puzzle, drafts included. */
export function fetchAllPuzzles(db: Db = getServerSupabase()): Promise<Puzzle[]> {
  return selectAll(db, false, "load puzzles");
}

/** One statement, so a batch is inserted all-or-nothing. */
export async function insertPuzzleRows(puzzles: Puzzle[], db: Db = getServerSupabase()): Promise<void> {
  if (puzzles.length === 0) return;
  const { error } = await db.from(PUZZLES_TABLE).insert(puzzles.map(puzzleToRow));
  if (error) throw new PuzzleStoreError("add puzzles", error);
}

/** Replaces the record stored as `originalId` (its id may change). False if it no longer exists. */
export async function updatePuzzleRow(originalId: string, puzzle: Puzzle, db: Db = getServerSupabase()): Promise<boolean> {
  const { data, error } = await db.from(PUZZLES_TABLE).update(puzzleToRow(puzzle)).eq("id", originalId).select("id");
  if (error) throw new PuzzleStoreError(`save ${originalId}`, error);
  return data.length > 0;
}

/** False if there was nothing to delete. */
export async function deletePuzzleRow(id: string, db: Db = getServerSupabase()): Promise<boolean> {
  const { data, error } = await db.from(PUZZLES_TABLE).delete().eq("id", id).select("id");
  if (error) throw new PuzzleStoreError(`delete ${id}`, error);
  return data.length > 0;
}

/** Publishes those of `ids` that are drafts; returns the ids it changed. */
export async function publishPuzzleRows(ids: string[], db: Db = getServerSupabase()): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from(PUZZLES_TABLE)
    .update({ status: "published" })
    .in("id", ids)
    .eq("status", "draft")
    .select("id");
  if (error) throw new PuzzleStoreError("publish puzzles", error);
  return (data as { id: string }[]).map((r) => r.id).sort();
}
