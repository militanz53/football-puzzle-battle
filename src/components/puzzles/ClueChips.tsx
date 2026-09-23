/**
 * Text clues that open one per reveal (Goal Map, Missing XI).
 * Clue i becomes visible at reveal `i + 1 + firstReveal - 1`.
 */
export function ClueChips({
  clues,
  revealed,
  firstReveal,
  compact = false,
}: {
  clues: { label: string; value: string }[];
  revealed: number;
  /** Reveal stage at which clues[0] opens. */
  firstReveal: number;
  compact?: boolean;
}) {
  return (
    <ul className={compact ? "flex flex-wrap gap-1.5" : "grid grid-cols-2 gap-2"}>
      {clues.map((clue, i) => {
        const at = firstReveal + i;
        const shown = at <= revealed;
        const newest = at === revealed;
        return (
          <li
            key={i}
            className={`rounded-xl border ${compact ? "flex items-baseline gap-1.5 px-2.5 py-1" : "px-3 py-2"} ${
              shown ? "border-border-subtle bg-bg-surface-alt" : "border-dashed border-border-subtle"
            }`}
          >
            <span
              className={`block font-display font-semibold uppercase tracking-widest text-text-muted ${
                compact ? "text-[9px]" : "text-[10px]"
              }`}
            >
              {clue.label}
            </span>
            {shown ? (
              <span
                key={clue.value}
                className={`block font-display font-bold motion-safe:animate-reveal ${compact ? "text-xs" : "text-sm"} ${
                  newest ? "text-accent" : "text-text-primary"
                }`}
              >
                {clue.value}
              </span>
            ) : (
              <span className={`block font-display font-bold text-text-muted-2 ${compact ? "text-xs" : "text-sm"}`}>
                ?
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
