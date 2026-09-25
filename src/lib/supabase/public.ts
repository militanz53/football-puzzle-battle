import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "./env";

// Public client: publishable key, for reads only. Safe in the browser, and also used
// on the server for the game's reads, so Row Level Security (not our code) is what
// keeps draft puzzles out of matches. The key grants only what RLS allows: select
// on published puzzles (supabase/migrations/…_create_puzzles.sql). Writes go through
// Server Functions and ./server.ts, never through this client.

let client: SupabaseClient | null = null;

export function getPublicSupabase(): SupabaseClient {
  if (!client) {
    const { url, publishableKey } = publicSupabaseConfig();
    // No login in the MVP (§29), so there is no session to keep.
    client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}
