import { REVEAL_COUNT } from "@/game/scoring";

/** Career Journey (§9 Puzzle 4): one slot per reveal, clubs open in order. */
export function CareerJourneyBoard({
  clubs,
  revealed,
}: {
  clubs: string[];
  revealed: number;
}) {
  const slots = Array.from({ length: REVEAL_COUNT }, (_, i) =>
    i < revealed ? clubs[i] : null,
  );

  return (
    <ol className="flex flex-col" aria-label="Career path">
      {slots.map((club, i) => {
        const newest = club !== null && i === revealed - 1;
        const last = i === slots.length - 1;
        return (
          <li key={i} className="relative flex h-12 items-center gap-4">
            {!last && (
              <span
                aria-hidden
                className={`absolute left-[11px] top-1/2 h-12 w-0.5 ${
                  i < revealed - 1 ? "bg-accent/40" : "bg-border-subtle"
                }`}
              />
            )}
            <span
              aria-hidden
              className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
                club
                  ? "border-accent bg-bg-surface"
                  : "border-dashed border-border-subtle bg-bg-surface"
              } ${newest ? "shadow-[0_0_16px_2px_rgba(62,213,152,0.45)]" : ""}`}
            >
              {club && <span className="h-2 w-2 rounded-full bg-accent" />}
            </span>

            {club ? (
              <span
                key={club}
                className={`font-display text-xl font-bold motion-safe:animate-reveal ${
                  newest ? "text-accent" : "text-text-primary"
                }`}
              >
                {club}
              </span>
            ) : (
              <span className="grid h-8 w-28 place-items-center rounded-lg border border-dashed border-border-subtle font-display text-base font-bold text-text-muted-2">
                ?
              </span>
            )}

            <span className="ml-auto font-display text-xs font-semibold tabular-nums text-text-muted-2">
              {String(i + 1).padStart(2, "0")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
