import type { RankTier } from "@/lib/account/rank";
import type { LeaderboardEntry, LeaderboardPage } from "@/lib/leaderboard";

/** Tier badges climb from muted grey to full accent (§22 palette, no new colours). */
const TIER_BADGE: Record<RankTier, string> = {
  Rookie: "border-border-subtle text-text-muted",
  "Semi-Pro": "border-border-subtle text-text-secondary",
  Pro: "border-text-muted-2 text-text-primary",
  Elite: "border-accent/40 text-accent/80",
  "World Class": "border-accent/70 text-accent",
  Legend: "border-accent bg-accent/15 text-accent",
  GOAT: "border-accent bg-accent text-bg-primary",
};

/** The podium: the top three in stepped accent tones, strongest first. */
const PODIUM: Record<number, { row: string; position: string }> = {
  1: { row: "border-accent/70 bg-accent/[0.12] shadow-[0_0_28px_-10px_rgba(62,213,152,0.6)]", position: "bg-accent text-bg-primary" },
  2: { row: "border-accent/45 bg-accent/[0.07]", position: "bg-accent/60 text-bg-primary" },
  3: { row: "border-accent/25 bg-accent/[0.04]", position: "bg-accent/30 text-text-primary" },
};

export function TierBadge({ tier }: { tier: RankTier }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider ${TIER_BADGE[tier]}`}>
      {tier}
    </span>
  );
}

function Row({ entry, you }: { entry: LeaderboardEntry; you: boolean }) {
  const podium = PODIUM[entry.position];
  return (
    <li
      data-position={entry.position}
      data-username={entry.username}
      data-you={you || undefined}
      aria-current={you ? "true" : undefined}
      className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
        you ? "border-accent bg-accent/10 ring-1 ring-accent" : podium ? podium.row : "border-border-subtle bg-bg-surface"
      }`}
    >
      <span
        className={`grid h-8 min-w-8 shrink-0 place-items-center rounded-full px-1.5 font-display text-sm font-bold tabular-nums ${
          podium ? podium.position : "text-text-secondary"
        }`}
      >
        {entry.position}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-display text-sm font-bold text-text-primary">{entry.username}</span>
          {you && <span className="shrink-0 font-display text-[10px] font-bold uppercase tracking-widest text-accent">You</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <TierBadge tier={entry.tier} />
          <span className="font-display text-[11px] font-semibold text-text-muted tabular-nums">
            {entry.matchesWon}W · {entry.matchesPlayed - entry.matchesWon}L
          </span>
        </span>
      </span>
      <span className={`shrink-0 font-display text-lg font-bold tabular-nums ${podium || you ? "text-accent" : "text-text-primary"}`}>
        {entry.rating}
      </span>
    </li>
  );
}

/** The ranked ladder, with the signed-in player's own line marked, and shown below if they are further down. */
export function LeaderboardList({ page }: { page: LeaderboardPage }) {
  if (page.entries.length === 0) {
    return <p className="rounded-2xl border border-border-subtle bg-bg-surface p-4 text-sm text-text-secondary">No ranked matches played yet. Be the first on the board.</p>;
  }
  return (
    <>
      <ol aria-label="Leaderboard" className="flex flex-col gap-2">
        {page.entries.map((entry) => (
          <Row key={entry.username} entry={entry} you={entry.you} />
        ))}
      </ol>
      {page.youBelow && page.you && (
        <div className="mt-4">
          <p className="mb-2 text-center font-display text-xs font-semibold uppercase tracking-widest text-text-secondary">
            Your rank: <span className="text-accent">#{page.you.position}</span>
          </p>
          <ol aria-label="Your rank">
            <Row entry={page.you} you />
          </ol>
        </div>
      )}
    </>
  );
}
