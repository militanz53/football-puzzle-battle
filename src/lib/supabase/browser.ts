import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "./env";

// Browser client: publishable key, for reads only. The key itself grants only what
// Row Level Security allows, so read-only is enforced by the database: every table
// gets RLS with select policies only (set up with the puzzle table, next step).
// Writes go through Server Functions and ./server.ts, never through this client.

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (!client) {
    const { url, publishableKey } = publicSupabaseConfig();
    // No login in the MVP (§29), so there is no session to keep.
    client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}
