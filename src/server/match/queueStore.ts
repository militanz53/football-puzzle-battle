import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueueEntry, QueueMode, QueueStatus, QueueStore } from "./queue";

// The match_queue table (supabase/migrations/…_match_queue.sql), secret key only.
// Pairing is the claim_queue_partner SQL function: it locks both rows in one
// transaction, so two players searching at once cannot be paired inconsistently.

export const QUEUE_TABLE = "match_queue";

interface QueueRow {
  id: string;
  session_id: string;
  status: QueueStatus;
  search_until: string;
  paired_with: string | null;
  match_id: string | null;
  resolved_at: string | null;
  nickname: string | null;
  mode: QueueMode;
  user_id: string | null;
}

const toEntry = (row: QueueRow): QueueEntry => ({
  id: row.id,
  sessionId: row.session_id,
  status: row.status,
  searchUntil: Date.parse(row.search_until),
  pairedWith: row.paired_with,
  matchId: row.match_id,
  resolvedAt: row.resolved_at ? Date.parse(row.resolved_at) : null,
  nickname: row.nickname,
  mode: row.mode,
  userId: row.user_id,
});

/** Older than any freshness window. */
const NEVER_SEEN = new Date(0).toISOString();

const COLUMNS = "id, session_id, status, search_until, paired_with, match_id, resolved_at, nickname, mode, user_id";

function fail(action: string, error: { message: string; code?: string }): never {
  throw new Error(`Could not ${action}: ${error.message}${error.code ? ` (${error.code})` : ""}`);
}

export function supabaseQueueStore(db: Pick<SupabaseClient, "from" | "rpc">): QueueStore {
  const table = () => db.from(QUEUE_TABLE);
  return {
    async insert(sessionId, searchUntil, nickname, userId) {
      const { data, error } = await table()
        .insert({
          session_id: sessionId,
          search_until: new Date(searchUntil).toISOString(),
          nickname,
          // Not yet seen: only the first poll (touch) makes the entry one others can be
          // paired with. A search the screen dropped straight away (a closed tab, or React
          // running effects twice in development) then never pairs anyone with a ghost.
          last_seen_at: NEVER_SEEN,
          // Quick Match leaves both to their defaults (mode quick, no account).
          ...(userId ? { mode: "ranked", user_id: userId } : {}),
        })
        .select(COLUMNS)
        .single();
      if (error) fail("join the queue", error);
      return toEntry(data as QueueRow);
    },
    async get(id) {
      const { data, error } = await table().select(COLUMNS).eq("id", id);
      if (error) fail("read the queue", error);
      const row = (data as QueueRow[])[0];
      return row ? toEntry(row) : null;
    },
    async touch(id) {
      const { error } = await table().update({ last_seen_at: new Date().toISOString() }).eq("id", id);
      if (error) fail("update the queue", error);
    },
    async claimPartner(id, freshSeconds) {
      const { data, error } = await db.rpc("claim_queue_partner", { p_entry: id, p_fresh_seconds: freshSeconds });
      if (error) fail("search the queue", error);
      return (data as string | null) ?? null;
    },
    async resolve(id, status) {
      const { data, error } = await table()
        .update({ status, resolved_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "waiting")
        .select("id");
      if (error) fail("update the queue", error);
      return data.length > 0;
    },
    async setMatch(id, matchId) {
      const { data, error } = await table().update({ match_id: matchId }).eq("id", id).is("match_id", null).select("id");
      if (error) fail("update the queue", error);
      return data.length > 0;
    },
  };
}
