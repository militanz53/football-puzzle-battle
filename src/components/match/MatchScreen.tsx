"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { NameEntry } from "@/data/names";
import { decidedWinner, regularRoundsPlayed, totals, type MatchState } from "@/game/match";
import { PUZZLE_LABEL } from "@/components/puzzles/PuzzleBoard";
import { roundCues } from "@/components/sound/cues";
import { play } from "@/components/sound/player";
import { SoundToggle } from "@/components/sound/SoundToggle";
import type { MatchView, PublicRound } from "@/server/match/view";
import { MatchResult } from "./MatchResult";
import { RoundPlay } from "./RoundPlay";
import { RoundResult } from "./RoundResult";
import { useServerMatch } from "./useServerMatch";

/**
 * Presence (§28): this player's own connection trouble, or the opponent's, with the
 * reconnect window counting down. Nothing shows while both are connected.
 */
function PresenceBanner({
  reconnecting,
  opponentName,
  away,
  receivedAt,
}: {
  reconnecting: boolean;
  opponentName: string;
  away: { reconnectInMs: number } | null;
  receivedAt: number;
}) {
  const [now, setNow] = useState(receivedAt);
  useEffect(() => {
    if (!away) return;
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [away]);
  if (!reconnecting && !away) return null;
  const seconds = away ? Math.max(0, Math.ceil((away.reconnectInMs - Math.max(0, now - receivedAt)) / 1000)) : 0;
  return (
    <p
      role="status"
      className="mb-3 flex items-center justify-center gap-2 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 font-display text-xs font-semibold uppercase tracking-widest text-amber-200"
    >
      <span className="h-2 w-2 rounded-full bg-amber-300 motion-safe:animate-pulse" aria-hidden />
      {reconnecting ? "Reconnecting…" : `${opponentName} reconnecting… ${seconds}s`}
    </p>
  );
}

/**
 * §11 says the next round starts "about 2 seconds" after the result. The result
 * screen carries the answer, points and the opponent's outcome, so it stays a little
 * longer; tapping the button skips the wait.
 */
const NEXT_ROUND_DELAY_MS = 3500;

function TopBar({ match }: { match: MatchState }) {
  const played = regularRoundsPlayed(match);
  const total = match.schedule.length;
  const currentIndex = match.status === "playing" && !match.suddenDeath ? played : played - 1;

  let label = "Match result";
  if (match.status !== "over") {
    label = match.suddenDeath
      ? "Sudden death"
      : `Round ${currentIndex + 1}/${total} · ${PUZZLE_LABEL[match.current.type]}`;
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          aria-label="Back to menu"
          className="grid h-9 w-9 place-items-center rounded-full text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <span
          className={`font-display text-xs font-semibold uppercase tracking-widest ${
            match.suddenDeath && match.status !== "over" ? "text-accent" : "text-text-muted"
          }`}
        >
          {label}
        </span>
        <SoundToggle />
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5" aria-hidden>
        {match.schedule.map((p, i) => (
          <span
            key={p.id}
            className={`h-1 rounded-full ${
              i === currentIndex && !match.suddenDeath && match.status !== "over"
                ? "bg-accent"
                : i < played
                  ? "bg-accent/40"
                  : "bg-bg-surface-alt"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function nextLabel(match: MatchState): string {
  if (regularRoundsPlayed(match) < match.schedule.length) return "Next round";
  return decidedWinner(match) ? "See match result" : "Sudden death";
}

/**
 * Match screen (§10): 5 rounds in §5 order, round results, then the match result.
 * The server runs the match (§27, src/app/match/actions.ts); this screen shows its
 * latest view and passes on the player's taps.
 */
export function MatchScreen({
  initialView,
  names,
  onSearchAgain,
  onOpenMatch,
}: {
  initialView: MatchView;
  names: NameEntry[];
  /** Back to the searching screen (a rematch offer nobody answered). */
  onSearchAgain: () => void;
  /** Switch to another match (the rematch both players asked for). */
  onOpenMatch: (view: MatchView) => void;
}) {
  const { view, round, submitting, buzz, submit, next, rematch, rematchState, reconnecting, receivedAt } = useServerMatch(initialView, {
    onSearchAgain,
    onOpenMatch,
  });
  const { match } = view;
  const scores = totals(match.rounds);
  const lastRound = match.rounds.at(-1);

  useEffect(() => {
    if (match.status !== "round-result") return;
    const timer = window.setTimeout(next, NEXT_ROUND_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [match.status, match.rounds.length, next]);

  // When the player's answer is the round's last move, the server answers with the
  // finished round straight away, so the round screen never shows the outcome: play
  // its correct / wrong sound (§23) from the result instead.
  const lastShown = useRef<PublicRound | null>(null);
  useEffect(() => {
    if (round) lastShown.current = round;
  }, [round]);
  useEffect(() => {
    const shown = lastShown.current;
    if (!lastRound || !shown) return;
    for (const cue of roundCues(shown, { ...shown, player: lastRound.player, bot: lastRound.bot })) {
      if (cue !== "reveal" && cue !== "buzz") play(cue);
    }
    lastShown.current = null;
  }, [match.rounds.length, lastRound]);

  return (
    <main data-match-id={view.id} className="flex flex-1 justify-center px-5">
      <div className="flex w-full max-w-[390px] flex-col py-4">
        <TopBar match={match} />
        {match.status !== "over" && (
          <PresenceBanner reconnecting={reconnecting} opponentName={view.opponentName} away={view.opponentAway} receivedAt={receivedAt} />
        )}

        {match.status === "playing" && round && (
          <RoundPlay
            key={`${view.id}:${match.rounds.length}`}
            puzzle={match.current}
            round={round}
            suddenDeath={match.suddenDeath}
            totals={scores}
            names={names}
            submitting={submitting}
            onBuzz={buzz}
            onSubmit={submit}
            opponentName={view.opponentName}
          />
        )}

        {match.status === "round-result" && lastRound && (
          <RoundResult
            key={match.rounds.length}
            record={lastRound}
            totals={scores}
            nextLabel={nextLabel(match)}
            delayMs={NEXT_ROUND_DELAY_MS}
            onNext={next}
            opponentName={view.opponentName}
          />
        )}

        {match.status === "over" && <MatchResult
            match={match}
            opponentName={view.opponentName}
            endedBecause={view.endedBecause}
            onRematch={rematch}
            rematchState={rematchState}
            opponentWantsRematch={Boolean(view.rematchOffer?.opponent)}
          />}
      </div>
    </main>
  );
}
