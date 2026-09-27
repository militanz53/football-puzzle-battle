// The Supabase Realtime channel a match's state is broadcast on. Shared by the
// server (src/server/match/broadcast.ts) and the browser (useServerMatch).
export const MATCH_STATE_EVENT = "state";

/**
 * One channel per seat: in a real-player match each player gets the match as they see
 * it (`match:<id>` for seat a, the only seat of a bot match; `match:<id>:b` for seat b).
 */
export function matchChannel(matchId: string, seat: "a" | "b" = "a"): string {
  return seat === "a" ? `match:${matchId}` : `match:${matchId}:b`;
}
