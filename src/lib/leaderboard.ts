import type { SupabaseClient } from "@supabase/supabase-js";
import { type RankTier, tierOf } from "@/lib/account/rank";

// The Ranked leaderboard (GDD §14), read with the publishable key from the public
// `leaderboard` view (supabase/migrations/…_leaderboard.sql), which carries only
// public columns. Players with no ranked match yet are not on it.

export const LEADERBOARD_VIEW = "leaderboard";
/** How many players the page lists. */
export const LEADERBOARD_SIZE = 100;

/** Exactly what the page may show about a player. */
export interface LeaderboardEntry {
  position: number;
  username: string;
  rating: number;
  tier: RankTier;
  matchesPlayed: number;
  matchesWon: number;
}

interface Row {
  position: number;
  username: string;
  rating: number;
  matches_played: number;
  matches_won: number;
}

// Never "*": only the columns the page shows are asked for.
const COLUMNS = "position, username, rating, matches_played, matches_won";

const toEntry = (row: Row): LeaderboardEntry => ({
  position: Number(row.position),
  username: row.username,
  rating: row.rating,
  tier: tierOf(row.rating),
  matchesPlayed: row.matches_played,
  matchesWon: row.matches_won,
});

type Db = Pick<SupabaseClient, "from">;

function fail(action: string, error: { message: string; code?: string }): never {
  throw new Error(`Could not ${action}: ${error.message}${error.code ? ` (${error.code})` : ""}`);
}

/** The top of the ladder: highest rating first; equal ratings by username. */
export async function topPlayers(limit: number, db: Db): Promise<LeaderboardEntry[]> {
  const { data, error } = await db.from(LEADERBOARD_VIEW).select(COLUMNS).order("position").order("username").limit(limit);
  if (error) fail("load the leaderboard", error);
  return (data as Row[]).map(toEntry);
}

/** One player's line (their position), or null if they have not played a ranked match. */
export async function leaderboardEntry(username: string, db: Db): Promise<LeaderboardEntry | null> {
  const { data, error } = await db.from(LEADERBOARD_VIEW).select(COLUMNS).eq("username", username).limit(1);
  if (error) fail("load your rank", error);
  const row = (data as Row[])[0];
  return row ? toEntry(row) : null;
}

export interface LeaderboardPage {
  entries: (LeaderboardEntry & { you: boolean })[];
  /** Signed in: your own line, whether or not it is in the list; null if unranked or signed out. */
  you: LeaderboardEntry | null;
  /** Your line is below the list, so the page shows it separately. */
  youBelow: boolean;
}

/** Marks the signed-in player's line and works out whether it needs a line of its own. */
export function leaderboardPage(entries: LeaderboardEntry[], you: LeaderboardEntry | null): LeaderboardPage {
  const listed = you !== null && entries.some((e) => e.username === you.username);
  return {
    entries: entries.map((e) => ({ ...e, you: you !== null && e.username === you.username })),
    you,
    youBelow: you !== null && !listed,
  };
}
