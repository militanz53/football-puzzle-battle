"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type NameEntry, suggestNames } from "@/data/names";
import { isRoundFinished, type ObservedRound } from "@/game/match";
import { ANSWER_WINDOW_MS, revealStage, type RoundState, type Side } from "@/game/round";
import { pointsForReveal, REVEAL_COUNT, REVEAL_POINTS } from "@/game/scoring";
import type { Puzzle } from "@/game/types";
import { PUZZLE_LABEL, PuzzleBoard } from "@/components/puzzles/PuzzleBoard";
import { roundCues } from "@/components/sound/cues";
import { play } from "@/components/sound/player";
import { Scoreboard } from "./Scoreboard";
import { useRound } from "./useRound";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Sudden Death decides the match without points (§12.1), so it hides the per-reveal values. */
function RevealTimer({ state, suddenDeath }: { state: RoundState; suddenDeath: boolean }) {
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
              {!suddenDeath && (
                <p
                  className={`mt-1.5 text-center font-display text-[11px] font-semibold tabular-nums ${
                    current ? "text-accent" : "text-text-muted-2"
                  }`}
                >
                  {pts}
                </p>
              )}
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
  names,
  onSubmit,
}: {
  answerMs: number;
  /** Points at stake, or null in Sudden Death. */
  worth: number | null;
  names: NameEntry[];
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  /** Highlighted suggestion (arrow keys), or -1 for the typed text. */
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const suggestions = useMemo(() => suggestNames(names, text), [names, text]);
  const left = Math.max(0, ANSWER_WINDOW_MS - answerMs);
  const open = suggestions.length > 0;

  return (
    <form
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(active >= 0 && suggestions[active] ? suggestions[active] : text);
      }}
    >
      {open && (
        // Above the input: on phones the keyboard covers everything below it.
        <ul
          id="answer-suggestions"
          role="listbox"
          aria-label="Suggested players"
          className="absolute inset-x-0 bottom-full mb-2 overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface-alt shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.6)]"
        >
          {suggestions.map((name, i) => (
            <li key={name} id={`answer-option-${i}`} role="option" aria-selected={i === active}>
              {/* One tap submits: the answer window is short. mousedown keeps focus in the input. */}
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSubmit(name)}
                className={`block w-full px-4 py-3 text-left text-base font-semibold ${
                  i === active ? "bg-accent/15 text-accent" : "text-text-primary hover:bg-bg-surface"
                } ${i > 0 ? "border-t border-border-subtle" : ""}`}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
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
          onChange={(e) => {
            setText(e.target.value);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((a) => Math.max(-1, Math.min(suggestions.length - 1, a + step)));
            } else if (e.key === "Escape") {
              setActive(-1);
            }
          }}
          placeholder="Type the player's name"
          aria-label="Your answer"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="answer-suggestions"
          aria-activedescendant={active >= 0 ? `answer-option-${active}` : undefined}
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
  names,
  onBuzz,
  onSubmit,
}: {
  state: RoundState;
  suddenDeath: boolean;
  names: NameEntry[];
  onBuzz: () => void;
  onSubmit: (text: string) => void;
}) {
  const { player } = state;
  const stake = (reveal: number) => (suddenDeath ? null : pointsForReveal(reveal));

  if (player.kind === "answering") {
    return <AnswerPanel answerMs={state.answerMs} worth={stake(player.reveal)} names={names} onSubmit={onSubmit} />;
  }

  if (player.kind === "correct" || player.kind === "wrong") {
    const good = player.kind === "correct";
    return (
      <div className="w-full rounded-2xl border border-border-subtle bg-bg-surface px-5 py-4 text-center">
        <p className={`font-display text-lg font-bold uppercase ${good ? "text-accent" : "text-text-primary"}`}>
          {good
            ? suddenDeath
              ? "Locked in"
              : `Locked in · +${player.points}`
            : player.timedOut
              ? "Time's up"
              : "Wrong answer"}
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

/** §23: round start on mount, then reveal / buzz / correct / wrong as the round changes. */
function useRoundSounds(round: RoundState) {
  const previous = useRef(round);
  useEffect(() => play("roundStart"), []);
  useEffect(() => {
    for (const cue of roundCues(previous.current, round)) play(cue);
    previous.current = round;
  }, [round]);
}

/** One live round: scoreboard, puzzle, reveal timer and buzz/answer controls (§10). */
export function RoundPlay({
  puzzle,
  suddenDeath,
  totals,
  names,
  onFinish,
}: {
  puzzle: Puzzle;
  suddenDeath: boolean;
  totals: Record<Side, number>;
  /** Autocomplete index for the answer box. */
  names: NameEntry[];
  onFinish: (round: ObservedRound) => void;
}) {
  const { state, buzz, submit } = useRound(puzzle);
  const { round } = state;
  useRoundSounds(round);

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

      {/* data-puzzle-* let the E2E tests look up the puzzle; the answer is never in the DOM. */}
      <section
        data-puzzle-id={puzzle.id}
        data-puzzle-type={puzzle.type}
        className="mt-4 rounded-[20px] border border-border-subtle bg-bg-surface p-4"
      >
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-accent">
          {suddenDeath ? `Sudden death · ${PUZZLE_LABEL[puzzle.type]}` : PUZZLE_LABEL[puzzle.type]}
        </p>
        <h1 className="mb-3 mt-0.5 font-display text-xl font-bold text-text-primary">{puzzle.question}</h1>
        <PuzzleBoard puzzle={puzzle} revealed={revealStage(round)} />
      </section>

      <div className="mt-4">
        <RevealTimer state={round} suddenDeath={suddenDeath} />
      </div>

      <div className="mt-auto flex justify-center pt-5">
        <BuzzArea state={round} suddenDeath={suddenDeath} names={names} onBuzz={buzz} onSubmit={submit} />
      </div>
    </>
  );
}
