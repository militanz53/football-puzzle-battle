import type { MissingXIPuzzle } from "@/game/types";
import { ClueChips } from "./ClueChips";

function PitchLines() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 68 50"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      fill="none"
      stroke="#26344A"
      strokeWidth={1}
    >
      <g vectorEffect="non-scaling-stroke">
        <rect x={0.5} y={0.5} width={67} height={49} vectorEffect="non-scaling-stroke" />
        <line x1={0} y1={25} x2={68} y2={25} vectorEffect="non-scaling-stroke" />
        <ellipse cx={34} cy={25} rx={7} ry={5} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

/**
 * Missing XI (§9.3.1): the ten given players sit on the pitch by position;
 * the missing one is a framed "?" card in its own spot. Reveals open context clues.
 */
export function MissingXIBoard({ puzzle, revealed }: { puzzle: MissingXIPuzzle; revealed: number }) {
  const { team, lineup, clues } = puzzle.reveal_data;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[68/50] w-full overflow-hidden rounded-xl border border-border-subtle bg-bg-primary">
        <PitchLines />
        <span className="absolute bottom-1.5 left-2 font-display text-[10px] font-semibold uppercase tracking-widest text-text-muted">
          {team}
        </span>
        {lineup.map((slot, i) => (
          <div
            key={i}
            className="absolute w-[4.5rem] -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
          >
            {slot.missing ? (
              <div className="grid h-9 place-items-center rounded-lg border-2 border-dashed border-accent bg-bg-surface font-display text-lg font-bold text-accent shadow-[0_0_16px_-2px_rgba(62,213,152,0.45)]">
                ?
              </div>
            ) : (
              <div className="flex h-9 flex-col items-center justify-center rounded-lg border border-border-subtle bg-bg-surface-alt px-0.5 leading-none">
                {slot.number !== undefined && (
                  <span className="font-display text-[9px] font-semibold tabular-nums text-text-muted">{slot.number}</span>
                )}
                <span className="mt-0.5 w-full truncate text-center text-[10.5px] font-semibold tracking-tight text-text-primary">
                  {slot.name}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <ClueChips clues={clues} revealed={revealed} firstReveal={1} compact />
    </div>
  );
}
