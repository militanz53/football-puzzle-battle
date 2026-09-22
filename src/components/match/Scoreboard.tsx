import type { Side, SideState } from "@/game/round";

function statusText(side: SideState, showPoints: boolean): { text: string; active: boolean } {
  switch (side.kind) {
    case "waiting":
      return { text: "Ready", active: false };
    case "answering":
      return { text: "Answering…", active: true };
    case "correct":
      return { text: showPoints ? `Correct · +${side.points}` : "Correct", active: true };
    case "wrong":
      return { text: side.timedOut ? "Time's up" : "Wrong", active: false };
    case "no-buzz":
      return { text: "No buzz", active: false };
  }
}

function Player({
  name,
  score,
  leading,
  level,
  side,
  align,
  showPoints,
}: {
  name: string;
  score: number;
  leading: boolean;
  level: boolean;
  side?: SideState;
  align: "left" | "right";
  showPoints: boolean;
}) {
  const status = side ? statusText(side, showPoints) : null;
  const right = align === "right";
  // §22.1: only the leading/active side gets the accent; the other stays secondary.
  const scoreColour = leading ? "text-accent" : level ? "text-text-primary" : "text-text-secondary";

  return (
    <div className={`flex min-w-0 items-center gap-3 ${right ? "flex-row-reverse text-right" : ""}`}>
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border font-display text-sm font-bold ${
          status?.active
            ? "border-accent bg-accent/10 text-accent"
            : "border-border-subtle bg-bg-surface text-text-secondary"
        }`}
      >
        {name[0]}
      </span>
      <div className="min-w-0">
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-text-muted">{name}</p>
        <p key={score} className={`font-display text-2xl font-bold leading-tight tabular-nums motion-safe:animate-pop ${scoreColour}`}>
          {score}
        </p>
        {status && (
          <p
            className={`truncate text-xs font-semibold ${status.active ? "text-accent" : "text-text-secondary"} ${
              side?.kind === "answering" ? "motion-safe:animate-pulse" : ""
            }`}
          >
            {status.text}
          </p>
        )}
      </div>
    </div>
  );
}

/** Top of the match screen (§10): Player — score vs score — Bot. */
export function Scoreboard({
  totals,
  player,
  bot,
  suddenDeath = false,
}: {
  totals: Record<Side, number>;
  player?: SideState;
  bot?: SideState;
  /** Sudden Death decides the winner without adding points. */
  suddenDeath?: boolean;
}) {
  const level = totals.player === totals.bot;
  return (
    <header className="flex items-center justify-between gap-2">
      <Player name="You" score={totals.player} leading={totals.player > totals.bot} level={level} side={player} align="left" showPoints={!suddenDeath} />
      <span className="font-display text-xs font-bold tracking-widest text-text-muted-2">VS</span>
      <Player name="Bot" score={totals.bot} leading={totals.bot > totals.player} level={level} side={bot} align="right" showPoints={!suddenDeath} />
    </header>
  );
}
