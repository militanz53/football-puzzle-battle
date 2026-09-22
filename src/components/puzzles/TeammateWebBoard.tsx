import type { TeammateWebPuzzle } from "@/game/types";

const SLOTS = 6;
// Fill opposite slots first so the web stays balanced: top, bottom, then around.
const SLOT_ORDER = [0, 3, 1, 4, 2, 5];

function slotPosition(slot: number) {
  const angle = (-90 + slot * (360 / SLOTS)) * (Math.PI / 180);
  return { x: 50 + 36 * Math.cos(angle), y: 50 + 40 * Math.sin(angle) };
}

/** Teammate Web (§9 Puzzle 5): reveal 1 shows two players, each reveal adds one. */
export function TeammateWebBoard({ puzzle, revealed }: { puzzle: TeammateWebPuzzle; revealed: number }) {
  const { players } = puzzle.reveal_data;
  const shownCount = Math.min(players.length, revealed + 1);

  const nodes = SLOT_ORDER.map((slot, i) => ({
    ...slotPosition(slot),
    name: i < shownCount ? players[i] : null,
    newest: i === shownCount - 1 && revealed > 1,
  }));

  return (
    <div className="relative h-64 w-full overflow-hidden rounded-xl border border-border-subtle bg-bg-primary">
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {nodes.map((n, i) => (
          <line
            key={i}
            x1={50}
            y1={50}
            x2={n.x}
            y2={n.y}
            stroke={n.name ? "#3ED598" : "#26344A"}
            strokeOpacity={n.name ? 0.5 : 1}
            strokeWidth={1.5}
            strokeDasharray={n.name ? undefined : "4 4"}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-dashed border-accent bg-bg-surface font-display text-2xl font-bold text-accent shadow-[0_0_24px_-4px_rgba(62,213,152,0.5)]">
        ?
      </div>

      {nodes.map((n, i) => (
        <div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${n.x}%`, top: `${n.y}%` }}
        >
          {n.name ? (
            <span
              key={n.name}
              className={`block whitespace-nowrap rounded-full border px-3 py-1.5 font-display text-sm font-bold motion-safe:animate-reveal ${
                n.newest
                  ? "border-accent bg-bg-surface text-accent"
                  : "border-border-subtle bg-bg-surface-alt text-text-primary"
              }`}
            >
              {n.name}
            </span>
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-border-subtle bg-bg-primary font-display text-xs font-bold text-text-muted-2">
              ?
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
