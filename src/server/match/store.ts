import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchState } from "@/game/match";
import type { RoundTimeline } from "@/game/timeline";
import type { MatchRecord, Players, Seat } from "./service";
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
  players: Players | null;
  ended: MatchRecord["ended"];
  rematch: MatchRecord["rematch"];
  seat_a_seen_at: string | null;
  seat_b_seen_at: string | null;
}

/** Facts about a match kept for statistics only; never part of a record or a view. */
export interface MatchOrigin {
  /** Who really played: the bot, or (once the engine supports it) a real player. */
  opponentKind: "bot" | "human";
  queueEntryId: string | null;
  playerSession: string | null;
  /** Seat b's session, for a real-player match. */
  opponentSession?: string | null;
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
    opponent_session: origin.opponentSession ?? null,
  });
  if (error) throw new MatchStoreError("create the match", error);
}

export async function loadMatch(id: string, db: Db): Promise<MatchRecord | null> {
  const loaded = await loadMatchWithPresence(id, db);
  return loaded?.record ?? null;
}

/** The match and each seat's last check-in (epoch ms, or null). */
export async function loadMatchWithPresence(
  id: string,
  db: Db,
): Promise<{ record: MatchRecord; seen: Record<Seat, number | null> } | null> {
  const { data, error } = await db
    .from(MATCHES_TABLE)
    .select("id, version, state, round, opponent_name, players, ended, rematch, seat_a_seen_at, seat_b_seen_at")
    .eq("id", id);
  if (error) throw new MatchStoreError("load the match", error);
  const row = (data as MatchRow[])[0];
  if (!row) return null;
  const time = (value: string | null) => (value ? Date.parse(value) : null);
  return {
    record: {
      id: row.id,
      version: row.version,
      match: row.state,
      round: row.round,
      opponentName: row.opponent_name,
      players: row.players,
      ended: row.ended,
      rematch: row.rematch,
    },
    seen: { a: time(row.seat_a_seen_at), b: time(row.seat_b_seen_at) },
  };
}

/** A seat checks in (presence); not a change to the match, so no new version. */
export async function touchSeat(id: string, seat: Seat, now: number, db: Db): Promise<void> {
  const column = seat === "a" ? "seat_a_seen_at" : "seat_b_seen_at";
  const { error } = await db.from(MATCHES_TABLE).update({ [column]: new Date(now).toISOString() }).eq("id", id);
  if (error) throw new MatchStoreError("update presence", error);
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

/** Real-player matches older than this are not resumed (a reloaded page starts a new search). */
const RESUME_WITHIN_MS = 60 * 60 * 1000;

/**
 * The real-player match this session is still in, for a player who reloads or reopens
 * the page (§28: they get their reconnect window back). Bot matches are not resumed.
 */
export async function findActiveRealMatch(session: string, now: number, db: Db): Promise<string | null> {
  const { data, error } = await db
    .from(MATCHES_TABLE)
    .select("id")
    .eq("opponent_kind", "human")
    .neq("status", "over")
    .or(`player_session.eq.${session},opponent_session.eq.${session}`)
    .gte("created_at", new Date(now - RESUME_WITHIN_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new MatchStoreError("look for a match to resume", error);
  return (data as { id: string }[])[0]?.id ?? null;
}
