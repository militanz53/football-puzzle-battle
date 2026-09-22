/** GDD §6.1 — every puzzle type has exactly 5 reveals. */
export const REVEAL_COUNT = 5;

/** GDD §8 — points for a correct answer, indexed by reveal stage (1-based). */
export const REVEAL_POINTS = [1000, 800, 600, 400, 200] as const;

export function pointsForReveal(reveal: number): number {
  return REVEAL_POINTS[reveal - 1] ?? 0;
}
