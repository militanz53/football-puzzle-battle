"use client";

import Link from "next/link";
import { useEffect } from "react";
import { play } from "@/components/sound/player";
import { playerStats, totals, type MatchState } from "@/game/match";
import { PUZZLE_LABEL } from "@/components/puzzles/PuzzleBoard";

const seconds = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
      <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-text-muted">{label}</p>
      <p className="mt-1 font-display text-lg font-bold text-text-primary">{value}</p>
    </div>
  );
}

/** Match result (§12): totals, VICTORY/DEFEAT and the player's stats. */
export function MatchResult({
  match,
  opponentName,
  endedBecause,
  onRematch,
  rematchState,
  opponentWantsRematch,
}: {
  match: MatchState;
  opponentName: string;
  /** Set when a player left before the end (a real-player match). */
  endedBecause: "opponent-left" | "you-left" | null;
  onRematch: () => void;
  /** Against a real player: waiting for their answer, or they did not answer. */
  rematchState: "idle" | "waiting" | "declined";
  /** Against a real player: they already asked for a rematch. */
  opponentWantsRematch: boolean;
}) {
  const t = totals(match.rounds);
  const won = match.winner === "player";
  const suddenDeathRounds = match.rounds.filter((r) => r.suddenDeath).length;
  const stats = playerStats(match);
  const sum = t.player + t.bot;
  const playerShare = sum === 0 ? 50 : (t.player / sum) * 100;

  useEffect(() => play(won ? "victory" : "defeat"), [won]);

  return (
    <section className="flex flex-1 flex-col" aria-live="polite">
      <div className="mt-6 text-center">
        <h2
          className={`font-display text-5xl font-bold uppercase tracking-tight motion-safe:animate-pop ${
            won ? "text-accent" : "text-text-primary"
          }`}
        >
          {won ? "Victory" : "Defeat"}
        </h2>
        {endedBecause && (
          <p className="mt-2 font-display text-xs font-semibold uppercase tracking-widest text-text-secondary">
            {endedBecause === "opponent-left" ? `${opponentName} left the match` : "You left the match"}
          </p>
        )}
        {!endedBecause && suddenDeathRounds > 0 && (
          <p className="mt-2 font-display text-xs font-semibold uppercase tracking-widest text-text-secondary">
            Decided in sudden death
            {suddenDeathRounds > 1 ? ` · ${suddenDeathRounds} rounds` : ""}
          </p>
        )}
      </div>

      <div className="mt-7">
        <div className="flex items-end justify-between">
          <div data-side="player">
            <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-text-muted">You</p>
            <p data-score className={`font-display text-3xl font-bold tabular-nums ${won ? "text-accent" : "text-text-secondary"}`}>
              {t.player}
            </p>
          </div>
          <span className="pb-2 font-display text-xs font-bold tracking-widest text-text-muted-2">VS</span>
          <div data-side="opponent" className="min-w-0 text-right">
            <p className="truncate font-display text-[11px] font-semibold uppercase tracking-widest text-text-muted">{opponentName}</p>
            <p data-score className={`font-display text-3xl font-bold tabular-nums ${won ? "text-text-secondary" : "text-accent"}`}>
              {t.bot}
            </p>
          </div>
        </div>
        <div className="mt-3 flex h-2 gap-1 overflow-hidden rounded-full">
          <div className={`rounded-full ${won ? "bg-accent" : "bg-bg-surface-alt"}`} style={{ width: `${playerShare}%` }} />
          <div className={`flex-1 rounded-full ${won ? "bg-bg-surface-alt" : "bg-accent"}`} />
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3">
        <Stat label="Correct answers" value={`${stats.correct}/${stats.rounds}`} />
        <Stat label="Average buzz" value={seconds(stats.averageBuzzMs)} />
        <Stat
          label="Best round"
          value={stats.bestRound ? `${PUZZLE_LABEL[stats.bestRound.puzzle.type]} +${stats.bestRound.points}` : "—"}
        />
        <Stat label="Fastest answer" value={seconds(stats.fastestCorrectMs)} />
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-8">
        {opponentWantsRematch && rematchState === "idle" && (
          <p role="status" className="text-center font-display text-sm font-semibold text-accent motion-safe:animate-pop">
            {opponentName} wants a rematch!
          </p>
        )}
        {rematchState === "declined" && (
          <p role="status" className="text-center font-display text-sm font-semibold text-text-secondary">
            {opponentName} left · finding a new opponent…
          </p>
        )}
        <button
          type="button"
          onClick={onRematch}
          disabled={rematchState !== "idle"}
          className="h-14 w-full rounded-2xl bg-accent font-display text-lg font-bold uppercase tracking-wider text-bg-primary transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-default disabled:opacity-70"
        >
          {rematchState === "waiting" ? `Waiting for ${opponentName}…` : "Rematch"}
        </button>
        <Link
          href="/"
          className="grid h-14 w-full place-items-center rounded-2xl border border-border-subtle font-display text-base font-semibold uppercase tracking-wider text-text-primary transition-colors hover:bg-bg-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          Home
        </Link>
      </div>
    </section>
  );
}
