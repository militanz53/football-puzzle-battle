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
  opponent_name: string;
}

/** Facts about a match kept for statistics only; never part of a record or a view. */
export interface MatchOrigin {
  /** Who really played: the bot, or (once the engine supports it) a real player. */
  opponentKind: "bot" | "human";
  queueEntryId: string | null;
  playerSession: string | null;
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

export async function insertMatch(record: MatchRecord, origin: MatchOrigin, now: number, db: Db): Promise<void> {
  const { error } = await db.from(MATCHES_TABLE).insert({
    ...toRow(record, now),
    opponent_kind: origin.opponentKind,
    queue_entry_id: origin.queueEntryId,
    player_session: origin.playerSession,
  });
  if (error) throw new MatchStoreError("create the match", error);
}

export async function loadMatch(id: string, db: Db): Promise<MatchRecord | null> {
  const { data, error } = await db.from(MATCHES_TABLE).select("id, version, state, round, opponent_name").eq("id", id);
  if (error) throw new MatchStoreError("load the match", error);
  const row = (data as MatchRow[])[0];
  return row ? { id: row.id, version: row.version, match: row.state, round: row.round, opponentName: row.opponent_name } : null;
}

/** How a finished match was set up, for its rematch (same opponent, §13.1). */
export async function loadMatchOrigin(id: string, db: Db): Promise<(MatchOrigin & { opponentName: string }) | null> {
  const { data, error } = await db
    .from(MATCHES_TABLE)
    .select("opponent_kind, opponent_name, queue_entry_id, player_session")
    .eq("id", id);
  if (error) throw new MatchStoreError("load the match", error);
  const row = (data as { opponent_kind: "bot" | "human"; opponent_name: string; queue_entry_id: string | null; player_session: string | null }[])[0];
  return row
    ? { opponentKind: row.opponent_kind, opponentName: row.opponent_name, queueEntryId: row.queue_entry_id, playerSession: row.player_session }
    : null;
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
