"use server";

import { createMatch, defaultDeps, runOnMatch } from "@/server/match/runner";
import { buzz, catchUp, nextRound, startRound, submitAnswer } from "@/server/match/service";
import type { MatchView } from "@/server/match/view";

// The match's only entry points (GDD §27: the server owns puzzle selection, round
// timing, reveals, buzz time, answer checking and scoring). The browser sends
// intentions ("buzz", "this is my answer"); the server times them on its own clock,
// decides, stores the match and pushes the new view over Realtime. Each call also
// returns that view, so the caller does not wait for the broadcast.
//
// No accounts yet (§29): a match id is a random UUID that only its page knows.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ANSWER_LENGTH = 100;

function matchId(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error("Invalid match id");
  return value;
}

/** Rematch: a new match with five freshly drawn puzzles. */
export async function newMatch(): Promise<MatchView> {
  return createMatch(defaultDeps());
}

/** The round on screen starts now (server clock). Harmless to repeat. */
export async function startMatchRound(id: string): Promise<MatchView> {
  return runOnMatch(matchId(id), startRound, defaultDeps());
}

/** Buzz (§7). Refused while the bot answers; the returned view says whether it counted. */
export async function buzzIn(id: string): Promise<MatchView> {
  return runOnMatch(matchId(id), (record, clock) => buzz(record, clock), defaultDeps());
}

/** The player's answer, checked on the server (§26.1). */
export async function answer(id: string, text: string): Promise<MatchView> {
  if (typeof text !== "string" || text.length > MAX_ANSWER_LENGTH) throw new Error("Invalid answer");
  return runOnMatch(matchId(id), (record, clock) => submitAnswer(record, clock, text), defaultDeps());
}

/** Brings the match up to the server clock (the browser calls this when view.nextChangeInMs is up). */
export async function syncMatch(id: string): Promise<MatchView> {
  return runOnMatch(matchId(id), (record, clock) => catchUp(record, clock.now), defaultDeps());
}

/** Leaves the round result: next round, Sudden Death, or the final result. */
export async function nextMatchRound(id: string): Promise<MatchView> {
  const deps = defaultDeps();
  return runOnMatch(matchId(id), (record, clock) => nextRound(record, clock, deps.loadPool), deps);
}
