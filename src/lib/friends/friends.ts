import "server-only";
import { findProfileByUsername, getProfiles, type Db, type Profile, searchProfiles } from "@/lib/account/profiles";

// Friends between Ranked accounts (supabase/migrations/…_friends.sql), secret key only.
// Every function acts for `me`, the signed-in account's id, which the Server Functions
// take from the session cookie; nothing here trusts a user id from the browser.
// Players are named by username towards the browser, never by id.

export const FRIEND_REQUESTS_TABLE = "friend_requests";
export const FRIENDSHIPS_TABLE = "friendships";

export class FriendsStoreError extends Error {
  constructor(action: string, cause: { message: string; code?: string }) {
    super(`Could not ${action}: ${cause.message}${cause.code ? ` (${cause.code})` : ""}`);
    this.name = "FriendsStoreError";
  }
}

interface RequestRow {
  id: string;
  from_user: string;
  to_user: string;
  status: "pending" | "accepted" | "declined";
}

/** A friendship row stores the pair in a fixed order. */
const pair = (x: string, y: string) => (x < y ? { user_a: x, user_b: y } : { user_a: y, user_b: x });

export type Relation = "self" | "friend" | "request-sent" | "request-received" | "none";

export interface PlayerSummary {
  username: string;
  rating: number;
  tier: Profile["tier"];
}

const summary = (p: Profile): PlayerSummary => ({ username: p.username, rating: p.rating, tier: p.tier });

async function friendIds(me: string, db: Db): Promise<string[]> {
  const [asA, asB] = await Promise.all([
    db.from(FRIENDSHIPS_TABLE).select("user_a, user_b").eq("user_a", me),
    db.from(FRIENDSHIPS_TABLE).select("user_a, user_b").eq("user_b", me),
  ]);
  const error = asA.error ?? asB.error;
  if (error) throw new FriendsStoreError("load friends", error);
  return [
    ...(asA.data as { user_b: string }[]).map((r) => r.user_b),
    ...(asB.data as { user_a: string }[]).map((r) => r.user_a),
  ];
}

export async function areFriends(x: string, y: string, db: Db): Promise<boolean> {
  const { user_a, user_b } = pair(x, y);
  const { data, error } = await db.from(FRIENDSHIPS_TABLE).select("user_a").eq("user_a", user_a).eq("user_b", user_b);
  if (error) throw new FriendsStoreError("check the friendship", error);
  return (data as unknown[]).length > 0;
}

async function pendingRequests(column: "from_user" | "to_user", me: string, db: Db): Promise<RequestRow[]> {
  const { data, error } = await db.from(FRIEND_REQUESTS_TABLE).select("id, from_user, to_user, status").eq(column, me).eq("status", "pending");
  if (error) throw new FriendsStoreError("load friend requests", error);
  return data as RequestRow[];
}

async function befriend(x: string, y: string, db: Db): Promise<void> {
  const { error } = await db.from(FRIENDSHIPS_TABLE).insert(pair(x, y));
  // Already friends (two requests crossed): nothing to add.
  if (error && error.code !== "23505") throw new FriendsStoreError("add the friend", error);
}

async function closeRequest(id: string, status: "accepted" | "declined", db: Db): Promise<boolean> {
  const { data, error } = await db
    .from(FRIEND_REQUESTS_TABLE)
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) throw new FriendsStoreError("answer the friend request", error);
  return (data as unknown[]).length > 0;
}

export type FriendResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Add Friend. If they already asked me, this accepts their request instead of
 * sending a second one the other way.
 */
export async function sendFriendRequest(me: string, username: string, db: Db): Promise<FriendResult> {
  const them = await findProfileByUsername(username, db);
  if (!them) return { ok: false, error: "No player with that username." };
  if (them.userId === me) return { ok: false, error: "That's you." };
  if (await areFriends(me, them.userId, db)) return { ok: false, error: `${them.username} is already your friend.` };

  const theirs = (await pendingRequests("to_user", me, db)).find((r) => r.from_user === them.userId);
  if (theirs) {
    if (await closeRequest(theirs.id, "accepted", db)) await befriend(me, them.userId, db);
    return { ok: true, message: `You and ${them.username} are now friends.` };
  }

  const { error } = await db.from(FRIEND_REQUESTS_TABLE).insert({ from_user: me, to_user: them.userId });
  // The one-pending-per-direction index: a request is already waiting.
  if (error?.code === "23505") return { ok: false, error: `You already asked ${them.username}.` };
  if (error) throw new FriendsStoreError("send the friend request", error);
  return { ok: true, message: `Friend request sent to ${them.username}.` };
}

/** Accept or Decline a request sent to me. */
export async function answerFriendRequest(me: string, requestId: string, accept: boolean, db: Db): Promise<FriendResult> {
  const request = (await pendingRequests("to_user", me, db)).find((r) => r.id === requestId);
  if (!request) return { ok: false, error: "That request is no longer open." };
  if (!(await closeRequest(request.id, accept ? "accepted" : "declined", db))) {
    return { ok: false, error: "That request is no longer open." };
  }
  if (accept) await befriend(me, request.from_user, db);
  return { ok: true, message: accept ? "Friend added." : "Request declined." };
}

export interface FriendsOverview {
  friends: PlayerSummary[];
  /** Requests to me, with the id to answer them by. */
  incoming: (PlayerSummary & { requestId: string })[];
  /** My requests still waiting for an answer. */
  outgoing: PlayerSummary[];
}

const byName = (a: PlayerSummary, b: PlayerSummary) => a.username.localeCompare(b.username, "en", { sensitivity: "base" });

export async function friendsOverview(me: string, db: Db): Promise<FriendsOverview> {
  const [friends, incoming, outgoing] = await Promise.all([friendIds(me, db), pendingRequests("to_user", me, db), pendingRequests("from_user", me, db)]);
  const profiles = new Map(
    (await getProfiles([...friends, ...incoming.map((r) => r.from_user), ...outgoing.map((r) => r.to_user)], db)).map((p) => [p.userId, p]),
  );
  const known = <T,>(items: T[], id: (item: T) => string) => items.filter((item) => profiles.has(id(item)));
  return {
    friends: known(friends, (id) => id).map((id) => summary(profiles.get(id)!)).sort(byName),
    incoming: known(incoming, (r) => r.from_user).map((r) => ({ ...summary(profiles.get(r.from_user)!), requestId: r.id })),
    outgoing: known(outgoing, (r) => r.to_user).map((r) => summary(profiles.get(r.to_user)!)).sort(byName),
  };
}

export const SEARCH_LIMIT = 8;

/** Players whose username starts with `query`, with where each stands with me. */
export async function searchPlayers(me: string, query: string, db: Db): Promise<(PlayerSummary & { relation: Relation })[]> {
  const text = query.trim();
  if (text.length < 2) return [];
  const [found, overview] = await Promise.all([searchProfiles(text, SEARCH_LIMIT, db), friendsOverview(me, db)]);
  const has = (list: PlayerSummary[], p: Profile) => list.some((x) => x.username === p.username);
  return found.map((p) => ({
    ...summary(p),
    relation:
      p.userId === me
        ? "self"
        : has(overview.friends, p)
          ? "friend"
          : has(overview.outgoing, p)
            ? "request-sent"
            : has(overview.incoming, p)
              ? "request-received"
              : "none",
  }));
}
