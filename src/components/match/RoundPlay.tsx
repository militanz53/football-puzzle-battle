"use client";

import { useEffect, useRef, useState } from "react";
import { isRoundFinished, type ObservedRound } from "@/game/match";
import { ANSWER_WINDOW_MS, revealStage, type RoundState, type Side } from "@/game/round";
import { pointsForReveal, REVEAL_COUNT, REVEAL_POINTS } from "@/game/scoring";
import type { Puzzle } from "@/game/types";
import { PUZZLE_LABEL, PuzzleBoard } from "@/components/puzzles/PuzzleBoard";
import { Scoreboard } from "./Scoreboard";
import { useRound } from "./useRound";

const pad2 = (n: number) => String(n).padStart(2, "0");

function RevealTimer({ state }: { state: RoundState }) {
  const stage = revealStage(state);
  const isLast = stage === REVEAL_COUNT;
  const nextAt = isLast ? state.windowMs : stage * state.intervalMs;
  const secondsLeft = Math.ceil((nextAt - state.clockMs) / 1000);

  let label = `${isLast ? "Time left" : "Next clue"}: ${pad2(secondsLeft)}`;
  if (state.answering === "bot") label = "Paused · bot is answering";
  if (state.answering === "player") label = "Paused · your answer";

  return (
    <div>
      <div className="flex items-center justify-between font-display text-xs font-semibold uppercase tracking-widest">
        <span className="tabular-nums text-text-secondary">{label}</span>
        <span className="text-text-muted">Clue {stage}/{REVEAL_COUNT}</span>
      </div>
      <div className="mt-2.5 grid grid-cols-5 gap-1.5">
        {REVEAL_POINTS.map((pts, i) => {
          const fill = Math.min(1, Math.max(0, (state.clockMs - i * state.intervalMs) / state.intervalMs));
          const current = i === stage - 1;
          return (
            <div key={pts}>
              <div className="h-1.5 overflow-hidden rounded-full bg-bg-surface-alt">
                <div
                  className={`h-full rounded-full ${current ? "bg-accent" : "bg-accent/40"}`}
                  style={{ width: `${fill * 100}%` }}
                />
              </div>
              <p
                className={`mt-1.5 text-center font-display text-[11px] font-semibold tabular-nums ${
                  current ? "text-accent" : "text-text-muted-2"
                }`}
              >
                {pts}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnswerPanel({
  answerMs,
  worth,
  onSubmit,
}: {
  answerMs: number;
  /** Points at stake, or null in Sudden Death. */
  worth: number | null;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const left = Math.max(0, ANSWER_WINDOW_MS - answerMs);

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(text);
      }}
    >
      <div className="mb-2 flex items-center justify-between font-display text-xs font-semibold uppercase tracking-widest">
        <span className="text-accent">Your answer{worth === null ? "" : ` · +${worth}`}</span>
        <span className="tabular-nums text-text-secondary">{pad2(Math.ceil(left / 1000))}s</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-bg-surface-alt">
        <div className="h-full rounded-full bg-accent" style={{ width: `${(left / ANSWER_WINDOW_MS) * 100}%` }} />
      </div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type the player's name"
          aria-label="Your answer"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          className="h-14 min-w-0 flex-1 rounded-2xl border border-border-subtle bg-bg-surface px-4 text-base font-semibold text-text-primary placeholder:text-text-muted-2 focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="h-14 shrink-0 rounded-2xl bg-accent px-5 font-display text-base font-bold uppercase tracking-wider text-bg-primary transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          Submit
        </button>
      </div>
    </form>
  );
}

function BuzzArea({
  state,
  suddenDeath,
  onBuzz,
  onSubmit,
}: {
  state: RoundState;
  suddenDeath: boolean;
  onBuzz: () => void;
  onSubmit: (text: string) => void;
}) {
  const { player } = state;
  const stake = (reveal: number) => (suddenDeath ? null : pointsForReveal(reveal));

  if (player.kind === "answering") {
    return <AnswerPanel answerMs={state.answerMs} worth={stake(player.reveal)} onSubmit={onSubmit} />;
  }

  if (player.kind === "correct" || player.kind === "wrong") {
    const good = player.kind === "correct";
    return (
      <div className="w-full rounded-2xl border border-border-subtle bg-bg-surface px-5 py-4 text-center">
        <p className={`font-display text-lg font-bold uppercase ${good ? "text-accent" : "text-text-primary"}`}>
          {good ? `Locked in · +${player.points}` : player.timedOut ? "Time's up" : "Wrong answer"}
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          {good ? "Waiting for your opponent…" : "You're out this round. Your opponent can still answer."}
        </p>
      </div>
    );
  }

  const blocked = state.answering === "bot";
  const worth = stake(revealStage(state));
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onBuzz}
        disabled={blocked}
        aria-label={worth === null ? "Buzz" : `Buzz for ${worth} points`}
        className="grid h-28 w-28 place-items-center rounded-full bg-accent font-display text-2xl font-bold uppercase tracking-wider text-bg-primary shadow-[0_0_0_8px_rgba(62,213,152,0.12),0_12px_40px_-8px_rgba(62,213,152,0.6)] transition hover:bg-accent-hover active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-accent disabled:bg-bg-surface-alt disabled:text-text-muted disabled:shadow-none disabled:active:scale-100"
      >
        Buzz
      </button>
      <p className="font-display text-xs font-semibold uppercase tracking-widest text-text-muted">
        {blocked
          ? "Opponent buzzed first"
          : worth === null
            ? "First correct answer wins"
            : `Buzz now for +${worth}`}
      </p>
    </div>
  );
}

/** One live round: scoreboard, puzzle, reveal timer and buzz/answer controls (§10). */
export function RoundPlay({
  puzzle,
  suddenDeath,
  totals,
  onFinish,
}: {
  puzzle: Puzzle;
  suddenDeath: boolean;
  totals: Record<Side, number>;
  onFinish: (round: ObservedRound) => void;
}) {
  const { state, buzz, submit } = useRound(puzzle);
  const { round } = state;

  const finished = isRoundFinished(state, suddenDeath);
  const reported = useRef(false);
  useEffect(() => {
    if (finished && !reported.current) {
      reported.current = true;
      onFinish(state);
    }
  }, [finished, state, onFinish]);

  // Desktop convenience: Space buzzes (ignored while typing an answer).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      buzz();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [buzz]);

  return (
    <>
      <Scoreboard totals={totals} player={round.player} bot={round.bot} suddenDeath={suddenDeath} />

      <section className="mt-4 rounded-[20px] border border-border-subtle bg-bg-surface p-4">
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-accent">
          {suddenDeath ? `Sudden death · ${PUZZLE_LABEL[puzzle.type]}` : PUZZLE_LABEL[puzzle.type]}
        </p>
        <h1 className="mb-3 mt-0.5 font-display text-xl font-bold text-text-primary">{puzzle.question}</h1>
        <PuzzleBoard puzzle={puzzle} revealed={revealStage(round)} />
      </section>

      <div className="mt-4">
        <RevealTimer state={round} />
      </div>

      <div className="mt-auto flex justify-center pt-5">
        <BuzzArea state={round} suddenDeath={suddenDeath} onBuzz={buzz} onSubmit={submit} />
      </div>
    </>
  );
}
