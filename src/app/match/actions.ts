"use server";

import { checkNickname } from "@/lib/nickname";
import { ensurePlayerName, playerSession, setPlayerName } from "@/lib/session";
import { currentAccount } from "@/lib/account/auth";
import { joinQueue, joinRankedQueue, leaveQueue, pollQueue, type QueuePoll } from "@/server/match/queue";
import { queueDeps } from "@/server/match/queueDeps";
import { checkIn, createMatch, defaultDeps, runOnMatch, viewMatch } from "@/server/match/runner";
import { abandonSolo, buzz, catchUp, linkRematch, nextRound, requestRematch, sideOf, startRound, submitAnswer } from "@/server/match/service";
import {
  findActiveRankedBotMatch,
  findActiveRealMatch,
  findUnfinishedRankedBotMatches,
  loadMatchOrigin,
  loadMatchWithPresence,
} from "@/server/match/store";
import type { MatchView } from "@/server/match/view";

// The match's only entry points (GDD §27: the server owns puzzle selection, round
// timing, reveals, buzz time, answer checking and scoring). The browser sends
// intentions ("find me an opponent", "buzz", "this is my answer"); the server times
// them on its own clock, decides, stores the match and pushes the new view over
// Realtime. Each call also returns that view, so the caller does not wait for it.
//
// A player is an anonymous session cookie, in Ranked too (the account only decides
// who may join the ranked lane and whose rating moves). A bot match is guarded by its
// random UUID; a match between two real players also checks that the cookie holds
// one of its two seats, and acts for that seat.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ANSWER_LENGTH = 100;

function uuid(value: unknown, what: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`Invalid ${what}`);
  return value;
}

// ---------------------------------------------------------------------------
// Quick Match (§13.1)
// ---------------------------------------------------------------------------

/**
 * The main menu's nickname box (§13.2). An empty box keeps the current name (the
 * first PLAY gives "Player_1234" to a player without one).
 */
export async function saveNickname(input: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const check = checkNickname(input);
  if (!check.ok) return check;
  await setPlayerName(check.name);
  return check;
}

/** PLAY: joins the queue under the player's nickname. The screen then polls until an opponent is found. */
export async function findOpponent(): Promise<{ entryId: string }> {
  const session = await playerSession();
  const entry = await joinQueue(session, await ensurePlayerName(), queueDeps(session));
  return { entryId: entry.id };
}

/**
 * RANKED (§13.5): joins the ranked lane as the signed-in account. Polling and leaving
 * are the same calls as Quick Match; nobody found in time, the bot takes the match.
 */
export async function findRankedOpponent(): Promise<{ entryId: string } | { signedOut: true }> {
  const account = await currentAccount();
  if (!account) return { signedOut: true };
  const session = await playerSession();
  // A new search means walking away from any ranked match against the bot still
  // unfinished: it counts as a loss (and moves the rating) before the next one starts.
  const deps = defaultDeps();
  for (const id of await findUnfinishedRankedBotMatches(account.userId, deps.db)) {
    await runOnMatch(id, (record) => abandonSolo(record), deps, session);
  }
  const entry = await joinRankedQueue(session, { userId: account.userId, username: account.username }, queueDeps(session));
  return { entryId: entry.id };
}

export async function pollOpponent(entryId: string): Promise<QueuePoll> {
  const session = await playerSession();
  return pollQueue(uuid(entryId, "queue entry"), session, queueDeps(session));
}

/** The player left the searching screen. */
export async function stopSearching(entryId: string): Promise<void> {
  const session = await playerSession();
  await leaveQueue(uuid(entryId, "queue entry"), session, queueDeps(session));
}

/**
 * Rematch against the bot: new puzzles, same opponent, at once, no queue (§13.1).
 * A real-player match uses offerRematch instead.
 */
export async function rematch(previousMatchId: string): Promise<MatchView> {
  const session = await playerSession();
  const deps = defaultDeps();
  const origin = await loadMatchOrigin(uuid(previousMatchId, "match id"), deps.db);
  if (!origin || origin.playerSession !== session || origin.opponentKind !== "bot") throw new Error("Unknown match");
  return createMatch(deps, origin.opponentName, { opponentKind: origin.opponentKind, queueEntryId: null, playerSession: session });
}

/**
 * Rematch after a real-player match (§13.1): this player's offer. If the opponent's
 * offer stands too, the two get a new match (same seats, same nicknames) and this
 * returns it; otherwise the screen waits for the opponent's answer, which arrives as
 * view.rematchNext over Realtime, or for the offer to run out.
 */
export async function offerRematch(id: string): Promise<{ status: "waiting"; view: MatchView } | { status: "ready"; view: MatchView }> {
  const session = await playerSession();
  const deps = defaultDeps();
  const matchId = uuid(id, "match id");
  let bothAsked = false;
  const offered = await runOnMatch(
    matchId,
    (record, clock, seat) => {
      const outcome = requestRematch(record, clock.now, seat);
      bothAsked = outcome.bothAsked;
      return outcome;
    },
    deps,
    session,
  );
  if (offered.rematchNext) return { status: "ready", view: await viewMatch(offered.rematchNext, deps, session) };
  if (!bothAsked) return { status: "waiting", view: offered };

  // Both asked: a new match between the same two players, seats, names and mode kept
  // (a friendly match's rematch is friendly too).
  const { players: seats, mode } = (await loadMatchWithPresence(matchId, deps.db))!.record;
  const players = seats!;
  const next = await createMatch(
    deps,
    players.b.name,
    { opponentKind: "human", queueEntryId: null, playerSession: players.a.session, opponentSession: players.b.session, mode },
    { ...players, since: deps.now() },
  );
  // If the opponent linked a rematch a moment earlier, both follow theirs.
  const linked = await runOnMatch(matchId, (record) => linkRematch(record, next.id), deps, session);
  return { status: "ready", view: await viewMatch(linked.rematchNext ?? next.id, deps, session) };
}

/** Opens a match this player holds a seat in (the rematch the opponent made). */
export async function openMatch(id: string): Promise<MatchView> {
  return viewMatch(uuid(id, "match id"), defaultDeps(), await playerSession());
}

/**
 * On opening /match: the real-player match this browser is still in, if any, so a
 * reload or a reopened tab gets back into it (§28) instead of starting a new search.
 */
export async function resumeMatch(): Promise<MatchView | null> {
  const session = await playerSession();
  const deps = defaultDeps();
  // A ranked match against the bot is resumed too: reloading is not leaving.
  const id = (await findActiveRealMatch(session, deps.now(), deps.db)) ?? (await findActiveRankedBotMatch(session, deps.now(), deps.db));
  return id ? viewMatch(id, deps, session) : null;
}

// ---------------------------------------------------------------------------
// Playing a match
// ---------------------------------------------------------------------------

/** The round on screen starts now (server clock). Harmless to repeat, and from either player. */
export async function startMatchRound(id: string): Promise<MatchView> {
  return runOnMatch(uuid(id, "match id"), startRound, defaultDeps(), await playerSession());
}

/** Buzz (§7). Refused while the opponent answers; the returned view says whether it counted. */
export async function buzzIn(id: string): Promise<MatchView> {
  return runOnMatch(uuid(id, "match id"), (record, clock, seat) => buzz(record, clock, sideOf(seat)), defaultDeps(), await playerSession());
}

/** The player's answer, checked on the server (§26.1). */
export async function answer(id: string, text: string): Promise<MatchView> {
  if (typeof text !== "string" || text.length > MAX_ANSWER_LENGTH) throw new Error("Invalid answer");
  return runOnMatch(
    uuid(id, "match id"),
    (record, clock, seat) => submitAnswer(record, clock, text, sideOf(seat)),
    defaultDeps(),
    await playerSession(),
  );
}

/** Brings the match up to the server clock (the browser calls this when view.nextChangeInMs is up). */
export async function syncMatch(id: string): Promise<MatchView> {
  return runOnMatch(uuid(id, "match id"), (record, clock) => catchUp(record, clock.now), defaultDeps(), await playerSession());
}

/** Leaves the round result: next round, Sudden Death, or the final result. Either player may call it. */
export async function nextMatchRound(id: string): Promise<MatchView> {
  const deps = defaultDeps();
  return runOnMatch(uuid(id, "match id"), (record, clock) => nextRound(record, clock, deps.loadPool), deps, await playerSession());
}

/**
 * The match screen checks in every few seconds. Against a real player this is
 * presence: a player silent for 20 s has left, and the other wins (§13.1).
 */
export async function stillHere(id: string): Promise<MatchView | null> {
  return checkIn(uuid(id, "match id"), await playerSession(), defaultDeps());
}
