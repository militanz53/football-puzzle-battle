"use server";

import { playerSession } from "@/lib/session";
import { getServerSupabase } from "@/lib/supabase/server";
import { joinQueue, leaveQueue, pollQueue, type QueueDeps, type QueuePoll } from "@/server/match/queue";
import { supabaseQueueStore } from "@/server/match/queueStore";
import { createMatch, defaultDeps, runOnMatch, viewMatch } from "@/server/match/runner";
import { buzz, catchUp, nextRound, startRound, submitAnswer } from "@/server/match/service";
import { loadMatchOrigin } from "@/server/match/store";
import type { MatchView } from "@/server/match/view";

// The match's only entry points (GDD §27: the server owns puzzle selection, round
// timing, reveals, buzz time, answer checking and scoring). The browser sends
// intentions ("find me an opponent", "buzz", "this is my answer"); the server times
// them on its own clock, decides, stores the match and pushes the new view over
// Realtime. Each call also returns that view, so the caller does not wait for it.
//
// No accounts yet (§29): a player is an anonymous session cookie, and a match id is
// a random UUID that only its page knows.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ANSWER_LENGTH = 100;

function uuid(value: unknown, what: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`Invalid ${what}`);
  return value;
}

function queueDeps(session: string): QueueDeps {
  const deps = defaultDeps();
  return {
    store: supabaseQueueStore(getServerSupabase()),
    now: deps.now,
    rng: deps.rng,
    // The engine's opponent plays every match for now, paired or not (see queue.ts).
    createMatch: (opponentName, queueEntryId) =>
      createMatch(deps, opponentName, { opponentKind: "bot", queueEntryId, playerSession: session }),
    viewMatch: (matchId) => viewMatch(matchId, deps),
  };
}

// ---------------------------------------------------------------------------
// Quick Match (§13.1)
// ---------------------------------------------------------------------------

/** PLAY: joins the queue. The screen then polls until an opponent is found. */
export async function findOpponent(): Promise<{ entryId: string }> {
  const session = await playerSession();
  const entry = await joinQueue(session, queueDeps(session));
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

/** Rematch: new puzzles against the same opponent, no queue (§13.1). */
export async function rematch(previousMatchId: string): Promise<MatchView> {
  const session = await playerSession();
  const deps = defaultDeps();
  const origin = await loadMatchOrigin(uuid(previousMatchId, "match id"), deps.db);
  if (!origin || origin.playerSession !== session) throw new Error("Unknown match");
  return createMatch(deps, origin.opponentName, { opponentKind: origin.opponentKind, queueEntryId: null, playerSession: session });
}

// ---------------------------------------------------------------------------
// Playing a match
// ---------------------------------------------------------------------------

/** The round on screen starts now (server clock). Harmless to repeat. */
export async function startMatchRound(id: string): Promise<MatchView> {
  return runOnMatch(uuid(id, "match id"), startRound, defaultDeps());
}

/** Buzz (§7). Refused while the opponent answers; the returned view says whether it counted. */
export async function buzzIn(id: string): Promise<MatchView> {
  return runOnMatch(uuid(id, "match id"), (record, clock) => buzz(record, clock), defaultDeps());
}

/** The player's answer, checked on the server (§26.1). */
export async function answer(id: string, text: string): Promise<MatchView> {
  if (typeof text !== "string" || text.length > MAX_ANSWER_LENGTH) throw new Error("Invalid answer");
  return runOnMatch(uuid(id, "match id"), (record, clock) => submitAnswer(record, clock, text), defaultDeps());
}

/** Brings the match up to the server clock (the browser calls this when view.nextChangeInMs is up). */
export async function syncMatch(id: string): Promise<MatchView> {
  return runOnMatch(uuid(id, "match id"), (record, clock) => catchUp(record, clock.now), defaultDeps());
}

/** Leaves the round result: next round, Sudden Death, or the final result. */
export async function nextMatchRound(id: string): Promise<MatchView> {
  const deps = defaultDeps();
  return runOnMatch(uuid(id, "match id"), (record, clock) => nextRound(record, clock, deps.loadPool), deps);
}
