import { eloResult, type RatingChange } from "@/lib/account/elo";
import type { Rng } from "@/game/bot";
import type { MatchRecord, Seat } from "./service";

// Ranked matches (GDD §13.5, §14): two accounts in the seats of a real-player match.
// When it is over, each seat's rating moves by Elo from the ratings both had when the
// match was made (kept in players.<seat>.account). Applying it to the profiles is the
// settle_ranked_match SQL function, which does it exactly once (./store.ts).

export type RankedResult = Record<Seat, RatingChange>;

/** The bot's ghost rating is the player's, give or take this much. */
export const GHOST_RATING_SPREAD = 50;

/**
 * A rating for the bot in a ranked match: a random one within ±50 of the player's,
 * so the Elo change is what a match against an equal would give, never a fixed value.
 */
export function ghostRating(playerRating: number, rng: Rng): number {
  const offset = Math.floor(rng() * (2 * GHOST_RATING_SPREAD + 1)) - GHOST_RATING_SPREAD;
  return Math.max(0, playerRating + offset);
}

/** A ranked match: its mode, never just two accounts (a friendly match has those too). */
export function isRanked(record: MatchRecord): boolean {
  if (record.mode !== "ranked") return false;
  return Boolean(record.rankedSolo || (record.players?.a.account && record.players?.b.account));
}

/** Seat a's and seat b's ratings when the match was made (seat b is the bot in a solo match). */
function startingRatings(record: MatchRecord): [number, number] {
  if (record.rankedSolo) return [record.rankedSolo.rating, record.rankedSolo.opponentRating];
  return [record.players!.a.account!.rating, record.players!.b.account!.rating];
}

/** The rating changes for a finished ranked match, or null if there is nothing to settle. */
export function rankedResult(record: MatchRecord): RankedResult | null {
  const winner = record.match.winner;
  if (!isRanked(record) || record.match.status !== "over" || !winner) return null;
  // Against the bot only seat a's change is applied (settle_ranked_match); seat b's is the bot's, never stored on a profile.
  const [a, b] = startingRatings(record);
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
