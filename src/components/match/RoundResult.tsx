import type { RoundRecord } from "@/game/match";
import type { Side, SideState } from "@/game/round";
import { PuzzleRecap } from "@/components/puzzles/PuzzleBoard";
import { Scoreboard } from "./Scoreboard";

const clues = (n: number) => `${n} ${n === 1 ? "clue" : "clues"}`;

function headline(player: SideState) {
  switch (player.kind) {
    case "correct":
      return { title: "Correct!", good: true };
    case "wrong":
      return { title: player.timedOut ? "Time's up" : "Wrong!", good: false };
    default:
      return { title: "No answer", good: false };
  }
}

function playerDetail(player: SideState): string {
  switch (player.kind) {
    case "correct":
      return `You buzzed after ${clues(player.reveal)}`;
    case "wrong":
      return player.timedOut
        ? `You buzzed after ${clues(player.reveal)} but ran out of time`
        : `You buzzed after ${clues(player.reveal)}`;
    default:
      return "You didn't buzz this round";
  }
}

function botDetail(bot: SideState, suddenDeath: boolean): string {
  const pts = (n: number) => (suddenDeath ? "" : ` · +${n}`);
  switch (bot.kind) {
    case "correct":
      return `Correct after ${clues(bot.reveal)}${pts(bot.points)}`;
    case "wrong":
      return `Wrong after ${clues(bot.reveal)}${pts(0)}`;
    case "answering":
      return "Still answering";
    case "waiting":
      return "Didn't get to buzz";
    case "no-buzz":
      return `Didn't buzz${pts(0)}`;
  }
}

function suddenDeathVerdict(first: Side | null) {
  if (first === "player") return { text: "You win the match!", good: true };
  if (first === "bot") return { text: "Bot wins the match", good: false };
  return { text: "Still level · another sudden death round", good: false };
}

/** Round result (§11). Moves on by itself after `delayMs`, or on tap. */
export function RoundResult({
  record,
  totals,
  nextLabel,
  delayMs,
  onNext,
}: {
  record: RoundRecord;
  totals: Record<Side, number>;
  nextLabel: string;
  delayMs: number;
  onNext: () => void;
}) {
  const { player, bot, puzzle, suddenDeath } = record;
  const { title, good } = headline(player);
  const points = player.kind === "correct" ? player.points : 0;
  const typed = player.kind === "wrong" && !player.timedOut && player.answer ? player.answer : null;
  const verdict = suddenDeath ? suddenDeathVerdict(record.firstCorrect) : null;

  return (
    <>
      <Scoreboard totals={totals} player={player} bot={bot} suddenDeath={suddenDeath} />

      <section className="flex flex-1 flex-col items-center text-center" aria-live="polite">
        <div
          className={`mt-6 grid h-14 w-14 place-items-center rounded-full motion-safe:animate-pop ${
            good ? "bg-accent text-bg-primary" : "bg-bg-surface-alt text-text-secondary"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {good ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M7 7l10 10M17 7L7 17" />}
          </svg>
        </div>

        <h2 className={`mt-4 font-display text-4xl font-bold uppercase tracking-tight ${good ? "text-accent" : "text-text-primary"}`}>
          {title}
        </h2>

        <p className="mt-5 font-display text-xs font-semibold uppercase tracking-widest text-text-muted">The answer</p>
        <p className="mt-1 font-display text-2xl font-bold uppercase text-text-primary">{puzzle.correct_answer}</p>
        {typed && <p className="mt-1.5 text-sm text-text-secondary">You answered “{typed}”</p>}

        {verdict ? (
          <p
            className={`mt-5 font-display text-2xl font-bold uppercase motion-safe:animate-pop ${
              verdict.good ? "text-accent" : "text-text-primary"
            }`}
          >
            {verdict.text}
          </p>
        ) : (
          <p
            className={`mt-4 font-display text-6xl font-bold tabular-nums motion-safe:animate-pop ${
              good ? "text-accent" : "text-text-muted-2"
            }`}
          >
            +{points}
          </p>
        )}
        <p className="mt-2 font-display text-xs font-semibold uppercase tracking-widest text-text-secondary">
          {playerDetail(player)}
        </p>

        <div className="mt-6 w-full rounded-2xl border border-border-subtle bg-bg-surface p-4 text-left">
          <PuzzleRecap puzzle={puzzle} />
          <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3 text-sm">
            <span className="font-display font-semibold text-text-secondary">Bot</span>
            <span className="text-text-secondary">{botDetail(bot, suddenDeath)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onNext}
          className="relative mt-auto h-14 w-full overflow-hidden rounded-2xl border border-border-subtle font-display text-base font-bold uppercase tracking-wider text-text-primary transition-colors hover:bg-bg-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-accent/15 motion-safe:animate-countdown"
            style={{ animationDuration: `${delayMs}ms` }}
          />
          <span className="relative">{nextLabel}</span>
        </button>
      </section>
    </>
  );
}
