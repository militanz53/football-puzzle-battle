"use server";

import { currentAccountId } from "@/lib/account/auth";
import {
  answerChallenge,
  type AnswerResult,
  cancelChallenge,
  type ChallengeDeps,
  checkChallenge,
  incomingChallenges,
  type Invite,
  sendChallenge,
  type SendResult,
  type WaitResult,
} from "@/lib/friends/challenges";
import { notifyInbox } from "@/lib/friends/inbox";
import { playerSession } from "@/lib/session";
import { friendlyMatchMaker } from "@/server/match/friendly";
import { defaultDeps } from "@/server/match/runner";
import { answerFriendRequest, type FriendResult, friendsOverview, type FriendsOverview, searchPlayers, sendFriendRequest } from "@/lib/friends/friends";
import { getServerSupabase } from "@/lib/supabase/server";

// The Friends page (Ranked accounts only). Every call acts for the account in the
// session cookie; players are named by username, never by id.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_QUERY = 16;

async function me(): Promise<string> {
  const id = await currentAccountId();
  if (!id) throw new Error("Sign in first");
  return id;
}

export type FriendsReply = FriendResult & { overview: FriendsOverview };

export async function loadFriends(): Promise<FriendsOverview> {
  return friendsOverview(await me(), getServerSupabase());
}

export async function findPlayers(query: string) {
  if (typeof query !== "string" || query.length > MAX_QUERY) return [];
  return searchPlayers(await me(), query, getServerSupabase());
}

export async function addFriend(username: string): Promise<FriendsReply> {
  const id = await me();
  const db = getServerSupabase();
  const result =
    typeof username === "string" && username.length <= MAX_QUERY ? await sendFriendRequest(id, username, db) : ({ ok: false, error: "No player with that username." } as const);
  return { ...result, overview: await friendsOverview(id, db) };
}

export async function answerRequest(requestId: string, accept: boolean): Promise<FriendsReply> {
  const id = await me();
  const db = getServerSupabase();
  const result =
    typeof requestId === "string" && UUID.test(requestId)
      ? await answerFriendRequest(id, requestId, accept === true, db)
      : ({ ok: false, error: "That request is no longer open." } as const);
  return { ...result, overview: await friendsOverview(id, db) };
}

// ---------------------------------------------------------------------------
// Challenges (friendly matches)
// ---------------------------------------------------------------------------

const challengeDeps = (): ChallengeDeps => ({ db: getServerSupabase(), now: Date.now, notify: notifyInbox });
const challengeId = (id: unknown): string => {
  if (typeof id !== "string" || !UUID.test(id)) throw new Error("Invalid challenge");
  return id;
};

/** Challenges waiting for me (the invite shown on the menu and the Friends page). */
export async function incomingInvites(): Promise<Invite[]> {
  const id = await currentAccountId();
  return id ? incomingChallenges(id, challengeDeps()) : [];
}

/** Challenge: from this browser, which becomes my seat in the match. */
export async function challengeFriend(username: string): Promise<SendResult> {
  if (typeof username !== "string" || username.length > MAX_QUERY) return { ok: false, error: "You can only challenge your friends." };
  return sendChallenge(await me(), await playerSession(), username, challengeDeps());
}

/** The waiting screen asks every 2 s (and keeps the challenge alive). */
export async function waitForChallenge(id: string): Promise<WaitResult> {
  return checkChallenge(await me(), challengeId(id), challengeDeps());
}

export async function withdrawChallenge(id: string): Promise<void> {
  await cancelChallenge(await me(), challengeId(id), challengeDeps());
}

/** Accept (the match is made now, this browser takes the second seat) or Decline. */
export async function respondToChallenge(id: string, accept: boolean): Promise<AnswerResult> {
  const deps = challengeDeps();
  return answerChallenge(await me(), await playerSession(), challengeId(id), accept === true, {
    ...deps,
    createFriendlyMatch: friendlyMatchMaker(defaultDeps()),
  });
}
