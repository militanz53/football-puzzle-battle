// Ranked rating changes (GDD §14: "Elo/MMR benzeri"): classic Elo. A win against a
// stronger player earns more than a win against a weaker one; the two changes always
// add up to zero (before the floor at 0).

/** How far one match moves a rating at most. 32 is the usual start for a young ladder. */
export const K_FACTOR = 32;

/** The chance Elo gives `rating` to beat `opponent` (0..1). */
export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

export interface RatingChange {
  before: number;
  after: number;
  delta: number;
}

/** Both players' changes after `winner` beat `loser`. Ratings never go below 0. */
export function eloResult(winner: number, loser: number, k = K_FACTOR): { winner: RatingChange; loser: RatingChange } {
  const gain = Math.round(k * (1 - expectedScore(winner, loser)));
  const change = (before: number, delta: number): RatingChange => {
    const after = Math.max(0, before + delta);
    return { before, after, delta: after - before };
  };
  return { winner: change(winner, gain), loser: change(loser, -gain) };
}
