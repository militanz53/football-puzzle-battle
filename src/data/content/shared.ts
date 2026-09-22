/**
 * Fields every MVP puzzle shares (§6.1: 3 s reveals; §29.1: Medium bot).
 *
 * Difficulty guide, adapted per type from the Career Journey tiers in §9.4
 * (Easy: clubs + years / Medium: clubs only / Hard: only colours, countries or cities):
 * - Goal Map: Easy = iconic finals, Medium = famous club goals, Hard = older or group-stage goals.
 * - Photo Reveal: Easy = one-of-a-kind look, Medium = well-known star, Hard = less distinctive look.
 * - Missing XI: Easy = recent World Cup final + its star, Medium = famous final + key player,
 *   Hard = older final + squad player.
 * - Career Journey: exactly §9.4 — years shown / clubs only / home cities or countries only.
 * - Teammate Web: Easy = superstar connector, Medium = well-known connector, Hard = connector
 *   known mainly to regular followers, across three or more clubs.
 *
 * Sourcing: minutes, seasons, opponents, line-ups, shirt numbers and club careers were checked
 * against the English Wikipedia match/player pages in September 2026. Pitch drawings (Goal Map
 * move geometry, Missing XI placement) are stylised, not traced from footage (§35).
 */
export const shared = {
  status: "published",
  reveal_interval_seconds: 3,
  bot_difficulty: "medium",
} as const;
