import { totals, type MatchState, type RoundRecord } from "@/game/match";
import type { RoundState, Side } from "@/game/round";
import { msUntilNextChange } from "@/game/timeline";
import type { Puzzle } from "@/game/types";
import type { RatingChange } from "@/lib/account/elo";
import { type RankTier, tierOf } from "@/lib/account/rank";
import { matchChannel } from "@/lib/matchChannel";
import {
  AWAY_AFTER_MS,
  LEAVE_AFTER_MS,
  offerStands,
  otherSeat,
  REMATCH_WINDOW_MS,
  replayNow,
  silentFor,
  type MatchRecord,
  type Seat,
} from "./service";
import { isRanked } from "./ranked";

// What a browser may know about a match. Sent by the Server Functions and over
// Realtime. Everything here is safe to show: no bot plan, and no answer for a puzzle
// whose round is still to come or running.

/** The running round as the browser draws it: the engine state minus puzzle and bot plan. */
export type PublicRound = Omit<RoundState, "puzzle" | "botPlan">;

export interface MatchView {
  id: string;
  version: number;
  /** Server clock when this view was made; views of the same version are ordered by it. */
  serverTime: number;
  /** The match, with puzzles still in play stripped of their answers. */
  match: MatchState;
  /** Shown wherever the opponent is named. Never says whether it is a bot. */
  opponentName: string;
  /** The running round, or null before it starts and once it has finished. */
  round: PublicRound | null;
  /** When the round next changes by itself (bot, time-outs); the browser asks again then. */
  nextChangeInMs: number | null;
  /** The Realtime channel this viewer's updates arrive on. */
  channel: string;
  /** Set when the match ended because a player left: the opponent, or this viewer. */
  endedBecause: "opponent-left" | "you-left" | null;
  /**
   * Rematch: at once against the same opponent (the bot), offered to a real opponent,
   * or, in Ranked, a new search (a rematch would let two players farm rating).
   */
  rematch: "same-opponent" | "mutual" | "queue";
  /** Rematch offers that stand (§13.1): made by this viewer, by the opponent, and time left. */
  rematchOffer: { you: boolean; opponent: boolean; expiresInMs: number } | null;
  /** Once both asked: the new match between the same two players. */
  rematchNext: string | null;
  /** The opponent has gone silent (§28): time left for them to reconnect. */
  opponentAway: { reconnectInMs: number } | null;
  /** Ranked (§13.5, §14): both accounts as the match began, and this viewer's change once it is over. */
  ranked: RankedView | null;
  /**
   * A match between two accounts (Ranked or friendly): both usernames and ratings, for
   * the scoreboard. Quick Match has none (nicknames only).
   */
  accounts: Pick<RankedView, "you" | "opponent"> | null;
  /** A friendly match between friends (§13.2): no rating at stake. */
  friendly: boolean;
}

export interface RankedPlayer {
  username: string;
  /** The rating when the match was made. */
  rating: number;
  tier: RankTier;
}

export interface RankedView {
  you: RankedPlayer;
  opponent: RankedPlayer;
  /** Set once the match is over and both ratings were updated. */
  change: (RatingChange & { tierBefore: RankTier; tierAfter: RankTier }) | null;
}

function accountsView(record: MatchRecord, seat: Seat): Pick<RankedView, "you" | "opponent"> | null {
  const players = record.players;
  if (!players?.a.account || !players.b.account) return null;
  const side = (s: Seat): RankedPlayer => {
    const rating = players[s].account!.rating;
    return { username: players[s].name, rating, tier: tierOf(rating) };
  };
  return { you: side(seat), opponent: side(otherSeat(seat)) };
}

function rankedView(record: MatchRecord, seat: Seat): RankedView | null {
  if (!isRanked(record)) return null;
  const solo = record.rankedSolo;
  const players = record.players;
  // Against the bot, seat b is the bot: its nickname and ghost rating, shown like anyone's.
  const side = (s: Seat): RankedPlayer => {
    const username = solo ? (s === "a" ? solo.username : record.opponentName) : players![s].name;
    const rating = solo ? (s === "a" ? solo.rating : solo.opponentRating) : players![s].account!.rating;
    return { username, rating, tier: tierOf(rating) };
  };
  const mine = record.rankedResult?.[seat];
  return {
    you: side(seat),
    opponent: side(otherSeat(seat)),
    change: mine ? { ...mine, tierBefore: tierOf(mine.before), tierAfter: tierOf(mine.after) } : null,
  };
}

/**
 * A puzzle without what gives it away: the answer and aliases, the tags, and the
 * missing player's name in a Missing XI line-up (the board shows "?" there anyway).
 */
export function hideAnswer(puzzle: Puzzle): Puzzle {
  const hidden = { ...puzzle, correct_answer: "", answer_aliases: [], tags: [] } as Puzzle;
  if (hidden.type === "missing_xi") {
    hidden.reveal_data = {
      ...hidden.reveal_data,
      lineup: hidden.reveal_data.lineup.map((slot) => (slot.missing ? { ...slot, name: "?" } : slot)),
    };
  }
  return hidden;
}

function publicRound(state: RoundState): PublicRound {
  const round: Partial<RoundState> = { ...state };
  delete round.puzzle; // the view carries the (answer-less) puzzle in match.current
  delete round.botPlan; // never leaves the server
  return round as PublicRound;
}

function rematchOffer(record: MatchRecord, now: number, seat: Seat): MatchView["rematchOffer"] {
  const offers = record.rematch;
  if (!offers || offers.next) return null;
  const you = offerStands(offers[seat], now);
  const opponent = offerStands(offers[otherSeat(seat)], now);
  if (!you && !opponent) return null;
  const first = Math.min(...[offers.a, offers.b].filter((t): t is number => offerStands(t, now)));
  return { you, opponent, expiresInMs: Math.max(0, REMATCH_WINDOW_MS - (now - first)) };
}

const flip = (side: Side | null): Side | null => (side === "player" ? "bot" : side === "bot" ? "player" : null);

function mirrorRecord(r: RoundRecord): RoundRecord {
  return { ...r, player: r.bot, bot: r.player, playerBuzzMs: r.botBuzzMs, botBuzzMs: r.playerBuzzMs, firstCorrect: flip(r.firstCorrect) };
}

/**
 * The match seen from seat b of a real-player match: the engine's opponent side is
 * this viewer, so "player" and "bot" swap everywhere. The screens then work the same
 * for both players: "You" on the left, the other player by name on the right.
 */
function mirror(view: MatchView): MatchView {
  const { match, round } = view;
  return {
    ...view,
    match: { ...match, rounds: match.rounds.map(mirrorRecord), winner: flip(match.winner) },
    round: round && { ...round, player: round.bot, bot: round.player, answering: flip(round.answering) },
  };
}

/**
 * The match as `seat` sees it (a bot match only has seat a). `seen` is each seat's last
 * check-in, for telling the viewer their opponent is away.
 */
export function toView(record: MatchRecord, now: number, seat: Seat = "a", seen?: Record<Seat, number | null>): MatchView {
  const { match } = record;
  const replay = replayNow(record, now);
  const inPlay = match.status === "playing";
  const round = replay ? publicRound(replay.state.round) : null;
  const players = record.players ?? null;
  const view: MatchView = {
    id: record.id,
    version: record.version,
    serverTime: now,
    opponentName: seat === "a" ? record.opponentName : (players?.a.name ?? record.opponentName),
    channel: matchChannel(record.id, seat),
    endedBecause: record.ended ? (record.ended.seat === seat ? "you-left" : "opponent-left") : null,
    rematch: isRanked(record) ? "queue" : players ? "mutual" : "same-opponent",
    rematchOffer: rematchOffer(record, now, seat),
    rematchNext: record.rematch?.next ?? null,
    ranked: rankedView(record, seat),
    accounts: accountsView(record, seat),
    friendly: record.mode === "friendly",
    opponentAway: (() => {
      if (!players || !seen || match.status === "over") return null;
      const silent = silentFor(players, seen, otherSeat(seat), now);
      return silent >= AWAY_AFTER_MS ? { reconnectInMs: Math.max(0, LEAVE_AFTER_MS - silent) } : null;
    })(),
    match: {
      ...match,
      schedule: match.schedule.map(hideAnswer),
      // Finished rounds keep their answers: the result screens show them (§11, §12).
      current: inPlay ? hideAnswer(match.current) : match.current,
    },
    round,
    nextChangeInMs:
      replay && record.round
        ? msUntilNextChange(match.current, record.round, now - record.round.startedAt, match.suddenDeath)
        : null,
  };
  return seat === "b" ? mirror(view) : view;
}

/** The table's readable columns, kept in step with the jsonb state on every write. */
export function summaryColumns(record: MatchRecord, now: number) {
  const { match, round } = record;
  const replay = replayNow(record, now);
  const last = match.rounds.at(-1);
  const score = totals(match.rounds);
  // The engine keeps fractional milliseconds (the bot's buzz time is drawn); the
  // integer columns get whole ones. The jsonb state keeps the exact values.
  const ms = (value: number | null | undefined) => (value === null || value === undefined ? null : Math.round(value));
  return {
    status: match.status,
    round_number: Math.max(1, match.rounds.length + (match.status === "playing" ? 1 : 0)),
    sudden_death: match.suddenDeath,
    current_puzzle_id: match.current.id,
    round_started_at: round ? new Date(round.startedAt).toISOString() : null,
    player_buzz_ms: ms(replay ? replay.state.playerBuzzMs : last?.playerBuzzMs),
    bot_buzz_ms: ms(replay ? replay.state.botBuzzMs : last?.botBuzzMs),
    player_score: score.player,
    bot_score: score.bot,
    winner: match.winner,
    opponent_name: record.opponentName,
    players: record.players ?? null,
    ended: record.ended ?? null,
    rematch: record.rematch ?? null,
  };
}
