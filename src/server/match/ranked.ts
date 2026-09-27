import { eloResult, type RatingChange } from "@/lib/account/elo";
import type { MatchRecord, Seat } from "./service";

// Ranked matches (GDD §13.5, §14): two accounts in the seats of a real-player match.
// When it is over, each seat's rating moves by Elo from the ratings both had when the
// match was made (kept in players.<seat>.account). Applying it to the profiles is the
// settle_ranked_match SQL function, which does it exactly once (./store.ts).

export type RankedResult = Record<Seat, RatingChange>;

export function isRanked(record: MatchRecord): boolean {
  return Boolean(record.players?.a.account && record.players?.b.account);
}

/** The rating changes for a finished ranked match, or null if there is nothing to settle. */
export function rankedResult(record: MatchRecord): RankedResult | null {
  const players = record.players;
  const winner = record.match.winner;
  if (!isRanked(record) || record.match.status !== "over" || !winner || !players) return null;
  const a = players.a.account!.rating;
  const b = players.b.account!.rating;
  if (winner === "player") {
    const r = eloResult(a, b);
    return { a: r.winner, b: r.loser };
  }
  const r = eloResult(b, a);
  return { a: r.loser, b: r.winner };
}

/** Whether a finished ranked match still has to be applied to the profiles. */
export function needsSettling(record: MatchRecord): boolean {
  return !record.rankedResult && rankedResult(record) !== null;
}
