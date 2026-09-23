"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  advance,
  createMatch,
  decidedWinner,
  recordRound,
  regularRoundsPlayed,
  totals,
  type MatchState,
  type ObservedRound,
} from "@/game/match";
import type { Puzzle } from "@/game/types";
import { PUZZLE_LABEL } from "@/components/puzzles/PuzzleBoard";
import { MatchResult } from "./MatchResult";
import { RoundPlay } from "./RoundPlay";
import { RoundResult } from "./RoundResult";

/**
 * §11 says the next round starts "about 2 seconds" after the result. The result
 * screen carries the answer, points and the bot's outcome, so it stays a little
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
        <span className="w-9" />
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

/** Match screen (§10): 5 rounds in §5 order, round results, then the match result. */
export function MatchScreen({
  pool,
  initialSchedule,
  drawSchedule,
}: {
  pool: Puzzle[];
  initialSchedule: Puzzle[];
  /** Server Function: each match's puzzles are drawn on the server. */
  drawSchedule: () => Promise<Puzzle[]>;
}) {
  const [match, setMatch] = useState(() => createMatch(initialSchedule));
  const drawing = useRef(false);
  // Bumped for every new round so RoundPlay remounts with a fresh engine state.
  const [roundKey, setRoundKey] = useState(0);

  const onFinish = useCallback((round: ObservedRound) => {
    setMatch((m) => (m.status === "playing" ? recordRound(m, round) : m));
  }, []);

  const next = useCallback(() => {
    const roll = Math.random(); // drawn here so the state updater stays pure
    setMatch((m) => (m.status === "round-result" ? advance(m, pool, () => roll) : m));
    setRoundKey((k) => k + 1);
  }, [pool]);

  const rematch = useCallback(async () => {
    if (drawing.current) return; // ignore repeat taps while the draw is in flight
    drawing.current = true;
    try {
      const schedule = await drawSchedule();
      setMatch(createMatch(schedule));
      setRoundKey((k) => k + 1);
    } finally {
      drawing.current = false;
    }
  }, [drawSchedule]);

  useEffect(() => {
    if (match.status !== "round-result") return;
    const id = window.setTimeout(next, NEXT_ROUND_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [match.status, match.rounds.length, next]);

  const scores = totals(match.rounds);
  const lastRound = match.rounds.at(-1);

  return (
    <main className="flex flex-1 justify-center px-5">
      <div className="flex w-full max-w-[390px] flex-col py-4">
        <TopBar match={match} />

        {match.status === "playing" && (
          <RoundPlay
            key={roundKey}
            puzzle={match.current}
            suddenDeath={match.suddenDeath}
            totals={scores}
            onFinish={onFinish}
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
          />
        )}

        {match.status === "over" && <MatchResult match={match} onRematch={rematch} />}
      </div>
    </main>
  );
}
