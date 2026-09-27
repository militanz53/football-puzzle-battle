// The Supabase Realtime channel a match's state is broadcast on. Shared by the
// server (src/server/match/broadcast.ts) and the browser (useServerMatch).
export const MATCH_STATE_EVENT = "state";

export function matchChannel(matchId: string): string {
  return `match:${matchId}`;
}
