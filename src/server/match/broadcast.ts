import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MATCH_STATE_EVENT } from "@/lib/matchChannel";
import type { MatchView } from "./view";

/**
 * Pushes a match's new view to its viewer's Realtime channel (view.channel: one per
 * seat, so each player gets the match as they see it). Sent over HTTP (no socket
 * needed on the server). The payload is the sanitised view, never the table row.
 */
export async function broadcastMatchView(view: MatchView, db: Pick<SupabaseClient, "channel" | "removeChannel">): Promise<void> {
  const channel = db.channel(view.channel);
  try {
    await channel.httpSend(MATCH_STATE_EVENT, view);
  } finally {
    await db.removeChannel(channel);
  }
}
