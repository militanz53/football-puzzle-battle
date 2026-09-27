import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MATCH_STATE_EVENT, matchChannel } from "@/lib/matchChannel";
import type { MatchView } from "./view";

/**
 * Pushes a match's new view to everyone listening on its Realtime channel. Sent over
 * HTTP (no socket needed on the server). The payload is the sanitised view, never
 * the table row.
 */
export async function broadcastMatchView(view: MatchView, db: Pick<SupabaseClient, "channel" | "removeChannel">): Promise<void> {
  const channel = db.channel(matchChannel(view.id));
  try {
    await channel.httpSend(MATCH_STATE_EVENT, view);
  } finally {
    await db.removeChannel(channel);
  }
}
