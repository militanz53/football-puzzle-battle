import "server-only";
import { findProfileByUsername, getProfile, getProfiles, type Db, type Profile } from "@/lib/account/profiles";
import { areFriends, type PlayerSummary } from "./friends";

// Challenge a friend (GDD §13.2): a friendly match offered to one friend. The
// challenger waits on the Friends page, whose polling keeps the challenge alive; the
// friend gets an invite (live over their inbox channel, or when they next open a
// page) and may accept or decline. Accepting makes the match at once, without the
// queue, since both players are known. Friendly matches never touch ratings.

export const CHALLENGES_TABLE = "challenges";

/** The challenger's waiting screen checks in every 2 s; silent this long, they have stopped waiting. */
export const CHALLENGER_STALE_MS = 15_000;
/** The challenger gives up after this long without an answer. */
export const CHALLENGE_WAIT_MS = 60_000;

export type ChallengeStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";

interface ChallengeRow {
  id: string;
  from_user: string;
  to_user: string;
  from_session: string;
  status: ChallengeStatus;
  from_seen_at: string;
  match_id: string | null;
  created_at: string;
}

const COLUMNS = "id, from_user, to_user, from_session, status, from_seen_at, match_id, created_at";

export class ChallengeStoreError extends Error {
  constructor(action: string, cause: { message: string; code?: string }) {
    super(`Could not ${action}: ${cause.message}${cause.code ? ` (${cause.code})` : ""}`);
    this.name = "ChallengeStoreError";
  }
}

export interface ChallengeDeps {
  db: Db;
  now: () => number;
  /** Tells a player's open pages that something changed for them (./inbox.ts). */
  notify: (userId: string) => Promise<void>;
}

const summary = (p: Profile): PlayerSummary => ({ username: p.username, rating: p.rating, tier: p.tier });
const iso = (ms: number) => new Date(ms).toISOString();

async function load(id: string, db: Db): Promise<ChallengeRow | null> {
  const { data, error } = await db.from(CHALLENGES_TABLE).select(COLUMNS).eq("id", id);
  if (error) throw new ChallengeStoreError("load the challenge", error);
  return (data as ChallengeRow[])[0] ?? null;
}

/** pending → `status`, only if still pending (two answers at once: the first wins). */
async function close(id: string, status: Exclude<ChallengeStatus, "pending">, now: number, db: Db): Promise<boolean> {
  const { data, error } = await db
    .from(CHALLENGES_TABLE)
    .update({ status, responded_at: iso(now) })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) throw new ChallengeStoreError("update the challenge", error);
  return (data as unknown[]).length > 0;
}

const challengerWaiting = (row: ChallengeRow, now: number) =>
  now - Date.parse(row.from_seen_at) < CHALLENGER_STALE_MS && now - Date.parse(row.created_at) < CHALLENGE_WAIT_MS;

export type SendResult = { ok: true; challengeId: string; opponent: PlayerSummary } | { ok: false; error: string };

/** Challenge: `me` (playing from browser `session`) challenges the friend called `username`. */
export async function sendChallenge(me: string, session: string, username: string, deps: ChallengeDeps): Promise<SendResult> {
  const { db } = deps;
  const them = await findProfileByUsername(username, db);
  if (!them || them.userId === me || !(await areFriends(me, them.userId, db))) {
    return { ok: false, error: "You can only challenge your friends." };
  }
  const now = deps.now();
  // One challenge at a time: an earlier one still open is withdrawn.
  const { data: open, error: openError } = await db
    .from(CHALLENGES_TABLE)
    .update({ status: "cancelled", responded_at: iso(now) })
    .eq("from_user", me)
    .eq("status", "pending")
    .select("to_user");
  if (openError) throw new ChallengeStoreError("withdraw the earlier challenge", openError);

  const { data, error } = await db
    .from(CHALLENGES_TABLE)
    .insert({ from_user: me, to_user: them.userId, from_session: session, from_seen_at: iso(now), created_at: iso(now) })
    .select("id");
  if (error) throw new ChallengeStoreError("send the challenge", error);

  const told = new Set([them.userId, ...(open as { to_user: string }[]).map((r) => r.to_user)]);
  await Promise.all([...told].map((id) => deps.notify(id)));
  return { ok: true, challengeId: (data as { id: string }[])[0].id, opponent: summary(them) };
}

export type WaitResult = { status: ChallengeStatus; matchId: string | null };

/**
 * The challenger's waiting screen asks every 2 s: this keeps the challenge alive, and
 * tells them when it was answered (with the match once it exists).
 */
export async function checkChallenge(me: string, id: string, deps: ChallengeDeps): Promise<WaitResult> {
  const row = await load(id, deps.db);
  if (!row || row.from_user !== me) return { status: "expired", matchId: null };
  const now = deps.now();
  if (row.status === "pending") {
    if (now - Date.parse(row.created_at) >= CHALLENGE_WAIT_MS) {
      if (await close(row.id, "expired", now, deps.db)) await deps.notify(row.to_user);
      return { status: "expired", matchId: null };
    }
    const { error } = await deps.db.from(CHALLENGES_TABLE).update({ from_seen_at: iso(now) }).eq("id", row.id).eq("status", "pending");
    if (error) throw new ChallengeStoreError("update the challenge", error);
  }
  return { status: row.status, matchId: row.match_id };
}

/** The challenger stops waiting. */
export async function cancelChallenge(me: string, id: string, deps: ChallengeDeps): Promise<void> {
  const row = await load(id, deps.db);
  if (!row || row.from_user !== me) return;
  if (await close(row.id, "cancelled", deps.now(), deps.db)) await deps.notify(row.to_user);
}

export interface Invite {
  challengeId: string;
  from: PlayerSummary;
}

/** Challenges waiting for `me` whose challenger is still waiting too. */
export async function incomingChallenges(me: string, deps: ChallengeDeps): Promise<Invite[]> {
  const { data, error } = await deps.db.from(CHALLENGES_TABLE).select(COLUMNS).eq("to_user", me).eq("status", "pending");
  if (error) throw new ChallengeStoreError("load challenges", error);
  const now = deps.now();
  const live = (data as ChallengeRow[]).filter((row) => challengerWaiting(row, now));
  const profiles = new Map((await getProfiles([...new Set(live.map((r) => r.from_user))], deps.db)).map((p) => [p.userId, p]));
  return live
    .filter((row) => profiles.has(row.from_user))
    .sort((x, y) => y.created_at.localeCompare(x.created_at))
    .map((row) => ({ challengeId: row.id, from: summary(profiles.get(row.from_user)!) }));
}

export type AnswerResult = { ok: true; matchId: string } | { ok: true; declined: true } | { ok: false; error: string };

/** The two seats of a friendly match: the challenger (seat a) and the friend who accepted (seat b). */
export type CreateFriendlyMatch = (challenger: { session: string; profile: Profile }, accepter: { session: string; profile: Profile }) => Promise<string>;

/** Accept or Decline, by the friend who was challenged (`me`, on browser `session`). */
export async function answerChallenge(
  me: string,
  session: string,
  id: string,
  accept: boolean,
  deps: ChallengeDeps & { createFriendlyMatch: CreateFriendlyMatch },
): Promise<AnswerResult> {
  const row = await load(id, deps.db);
  if (!row || row.to_user !== me || row.status !== "pending") return { ok: false, error: "This challenge is no longer open." };
  const now = deps.now();

  if (!accept) {
    if (await close(row.id, "declined", now, deps.db)) await deps.notify(row.from_user);
    return { ok: true, declined: true };
  }

  const [challenger, accepter] = await Promise.all([getProfile(row.from_user, deps.db), getProfile(me, deps.db)]);
  if (!challengerWaiting(row, now) || !challenger || !accepter) {
    if (await close(row.id, "expired", now, deps.db)) await deps.notify(row.from_user);
    return { ok: false, error: `${challenger?.username ?? "Your friend"} is no longer waiting.` };
  }
  if (row.from_session === session) return { ok: false, error: "You can't accept your own challenge in the same browser." };
  if (!(await areFriends(me, row.from_user, deps.db))) return { ok: false, error: "This challenge is no longer open." };
  if (!(await close(row.id, "accepted", now, deps.db))) return { ok: false, error: "This challenge is no longer open." };

  const matchId = await deps.createFriendlyMatch({ session: row.from_session, profile: challenger }, { session, profile: accepter });
  const { error } = await deps.db.from(CHALLENGES_TABLE).update({ match_id: matchId }).eq("id", row.id);
  if (error) throw new ChallengeStoreError("link the match", error);
  await deps.notify(row.from_user);
  return { ok: true, matchId };
}
