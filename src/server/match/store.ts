import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchState } from "@/game/match";
import type { RoundTimeline } from "@/game/timeline";
import type { MatchRecord } from "./service";
import { summaryColumns } from "./view";

// The `matches` table (supabase/migrations/…_create_matches.sql). Server only, with
// the secret key: the table holds answers and bot plans, and RLS gives the
// publishable key no access at all.

export const MATCHES_TABLE = "matches";

export type Db = Pick<SupabaseClient, "from">;

interface MatchRow {
  id: string;
  version: number;
  state: MatchState;
  round: RoundTimeline | null;
}

export class MatchStoreError extends Error {
  constructor(action: string, cause: { message: string; code?: string }) {
    super(`Could not ${action}: ${cause.message}${cause.code ? ` (${cause.code})` : ""}`);
    this.name = "MatchStoreError";
  }
}

const toRow = (record: MatchRecord, now: number) => ({
  id: record.id,
  version: record.version,
  state: record.match,
  round: record.round,
  ...summaryColumns(record, now),
});

export async function insertMatch(record: MatchRecord, now: number, db: Db): Promise<void> {
  const { error } = await db.from(MATCHES_TABLE).insert(toRow(record, now));
  if (error) throw new MatchStoreError("create the match", error);
}

export async function loadMatch(id: string, db: Db): Promise<MatchRecord | null> {
  const { data, error } = await db.from(MATCHES_TABLE).select("id, version, state, round").eq("id", id);
  if (error) throw new MatchStoreError("load the match", error);
  const row = (data as MatchRow[])[0];
  return row ? { id: row.id, version: row.version, match: row.state, round: row.round } : null;
}

/**
 * Writes `record` only if the row still has `readVersion`. False means someone else
 * wrote in between (another request for the same match); the caller retries.
 */
export async function saveMatch(record: MatchRecord, readVersion: number, now: number, db: Db): Promise<boolean> {
  const { data, error } = await db
    .from(MATCHES_TABLE)
    .update(toRow(record, now))
    .eq("id", record.id)
    .eq("version", readVersion)
    .select("id");
  if (error) throw new MatchStoreError("save the match", error);
  return data.length > 0;
}
