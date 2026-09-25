import type { SupabaseClient } from "@supabase/supabase-js";

// Connection check that needs no tables yet: query a table that does not exist.
// Supabase's API answers "table not found" (PGRST205) only after accepting the
// project URL and the key, so that answer means "connected". A bad key gets a
// 401, an unreachable host a network error.

const PROBE_TABLE = "_connection_check";
const TABLE_MISSING = new Set(["PGRST205", "42P01"]);

export type Health = { ok: true } | { ok: false; reason: string };

export async function pingSupabase(client: SupabaseClient): Promise<Health> {
  try {
    const { error, status } = await client.from(PROBE_TABLE).select("*").limit(1);
    if (!error || TABLE_MISSING.has(error.code)) return { ok: true };
    return { ok: false, reason: `HTTP ${status}${error.code ? ` ${error.code}` : ""}: ${error.message}` };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}
