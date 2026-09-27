// Rank tiers (GDD §14): ROOKIE → SEMI-PRO → PRO → ELITE → WORLD CLASS → LEGEND → GOAT.
// A tier is a rating range. The thresholds are a first guess to tune once real ratings
// exist: change `from` here and nothing else.

/** Every new account starts here (the bottom of PRO, the middle of the ladder). */
export const START_RATING = 1200;

export const RANK_TIERS = [
  { name: "Rookie", from: 0 },
  { name: "Semi-Pro", from: 1000 },
  { name: "Pro", from: 1200 },
  { name: "Elite", from: 1400 },
  { name: "World Class", from: 1600 },
  { name: "Legend", from: 1800 },
  { name: "GOAT", from: 2000 },
] as const satisfies readonly { name: string; from: number }[];

export type RankTier = (typeof RANK_TIERS)[number]["name"];

/** The tier a rating falls in: the highest one whose threshold it has reached. */
export function tierOf(rating: number): RankTier {
  let tier: RankTier = RANK_TIERS[0].name;
  for (const t of RANK_TIERS) if (rating >= t.from) tier = t.name;
  return tier;
}

/** Tier order, for telling a rank up from a rank down. */
export const tierIndex = (tier: RankTier): number => RANK_TIERS.findIndex((t) => t.name === tier);
