import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tierOf, type RankTier } from "./rank";

// The profiles table (supabase/migrations/…_ranked.sql), secret key only.

export const PROFILES_TABLE = "profiles";

export type Db = Pick<SupabaseClient, "from">;

export interface Profile {
  userId: string;
  username: string;
  rating: number;
  tier: RankTier;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
}

interface ProfileRow {
  user_id: string;
  username: string;
  rating: number;
  matches_played: number;
  matches_won: number;
  matches_lost: number;
}

const COLUMNS = "user_id, username, rating, matches_played, matches_won, matches_lost";

const toProfile = (row: ProfileRow): Profile => ({
  userId: row.user_id,
  username: row.username,
  rating: row.rating,
  tier: tierOf(row.rating),
  matchesPlayed: row.matches_played,
  matchesWon: row.matches_won,
  matchesLost: row.matches_lost,
});

export class ProfileStoreError extends Error {
  constructor(action: string, cause: { message: string; code?: string }) {
    super(`Could not ${action}: ${cause.message}${cause.code ? ` (${cause.code})` : ""}`);
    this.name = "ProfileStoreError";
  }
}

/** Postgres unique_violation: the username is taken (profiles_username_key). */
export const UNIQUE_VIOLATION = "23505";

export async function getProfile(userId: string, db: Db): Promise<Profile | null> {
  const { data, error } = await db.from(PROFILES_TABLE).select(COLUMNS).eq("user_id", userId);
  if (error) throw new ProfileStoreError("load the profile", error);
  const row = (data as ProfileRow[])[0];
  return row ? toProfile(row) : null;
}

/** Whether another account already has this username, ignoring case. */
export async function usernameTaken(username: string, db: Db): Promise<boolean> {
  // ilike without wildcards is a case-insensitive equality; "_" is a LIKE wildcard, so escape it.
  const pattern = username.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await db.from(PROFILES_TABLE).select("user_id").ilike("username", pattern).limit(1);
  if (error) throw new ProfileStoreError("check the username", error);
  return (data as unknown[]).length > 0;
}

/** A new account's profile at the starting rating. False if the username was taken meanwhile. */
export async function insertProfile(userId: string, username: string, db: Db): Promise<boolean> {
  const { error } = await db.from(PROFILES_TABLE).insert({ user_id: userId, username });
  if (error?.code === UNIQUE_VIOLATION) return false;
  if (error) throw new ProfileStoreError("create the profile", error);
  return true;
}
