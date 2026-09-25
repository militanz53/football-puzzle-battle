import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { secretSupabaseKey, supabaseUrl } from "./env";

// Server client: secret key, full access (bypasses Row Level Security). For the
// admin panel's writes and other server-owned work (§27: the server owns puzzle
// selection and scoring). `server-only` makes importing this from a Client
// Component a build error; the window check below catches anything else.

let client: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("getServerSupabase() must only run on the server: it holds the secret key.");
  }
  if (!client) {
    client = createClient(supabaseUrl(), secretSupabaseKey(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}
