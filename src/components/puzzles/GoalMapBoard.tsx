import type { GoalMapPuzzle, PitchPoint } from "@/game/types";
import { ClueChips } from "./ClueChips";

// Attacking third of a 68 m-wide pitch, goal at the top (§34: plain SVG, no engine).
const WIDTH = 68;
const DEPTH = 36;
const LINE = "#26344A";
const ACCENT = "#3ED598";

type Segment = { from: PitchPoint; to: PitchPoint };

const Line = ({ seg, ...rest }: { seg: Segment } & React.SVGProps<SVGLineElement>) => (
  <line x1={seg.from[0]} y1={seg.from[1]} x2={seg.to[0]} y2={seg.to[1]} {...rest} />
);

function Pitch() {
  return (
    <g fill="none" stroke={LINE} strokeWidth={0.35}>
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x={0} y={i * 6} width={WIDTH} height={3} fill="#121A2A" stroke="none" opacity={0.6} />
      ))}
      <rect x={0} y={0} width={WIDTH} height={DEPTH + 1} />
      <rect x={13.84} y={0} width={40.32} height={16.5} />
      <rect x={24.84} y={0} width={18.32} height={5.5} />
      <path d="M26.69 16.5 A9.15 9.15 0 0 0 41.31 16.5" />
      <circle cx={34} cy={11} r={0.35} fill={LINE} />
      <rect x={30.34} y={-2} width={7.32} height={2} strokeWidth={0.45} />
    </g>
  );
}

/** Goal Map (§9 Puzzle 1). Reveal 1 is the move; reveals 2-5 add the facts. */
export function GoalMapBoard({ puzzle, revealed }: { puzzle: GoalMapPuzzle; revealed: number }) {
  const { attackers, defenders, passes, shot, clues } = puzzle.reveal_data;
  const scorer = shot.from;
  const isScorer = (p: PitchPoint) => p[0] === scorer[0] && p[1] === scorer[1];

  return (
    <div className="flex flex-col gap-3">
      <svg
        viewBox={`0 -2.5 ${WIDTH} ${DEPTH + 2.5}`}
        className="w-full rounded-xl border border-border-subtle bg-bg-primary"
        role="img"
        aria-label="Top-down reconstruction of the goal"
      >
        <defs>
          <marker id="gm-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0 0 L6 3 L0 6 z" fill={ACCENT} />
          </marker>
        </defs>
        <Pitch />

        {defenders.map((p, i) => (
          <circle key={`d${i}`} cx={p[0]} cy={p[1]} r={1.1} fill="#0B1220" stroke="#6B7A8D" strokeWidth={0.4} />
        ))}

        {passes.map((pass, i) => (
          <Line
            key={`p${i}`}
            seg={pass}
            stroke={ACCENT}
            strokeWidth={0.45}
            strokeDasharray="1.2 0.9"
            opacity={0.85}
            markerEnd="url(#gm-arrow)"
          />
        ))}
        <Line
          seg={shot}
          pathLength={1}
          stroke={ACCENT}
          strokeWidth={0.7}
          markerEnd="url(#gm-arrow)"
          className="motion-safe:animate-draw"
        />

        {attackers
          .filter((p) => !isScorer(p))
          .map((p, i) => (
            <circle key={`a${i}`} cx={p[0]} cy={p[1]} r={1.1} fill={ACCENT} opacity={0.55} />
          ))}
        <circle cx={scorer[0]} cy={scorer[1]} r={2.1} fill="#0B1220" stroke={ACCENT} strokeWidth={0.5} />
        <text
          x={scorer[0]}
          y={scorer[1] + 0.95}
          textAnchor="middle"
          fontSize={2.6}
          fontWeight={700}
          fill={ACCENT}
          className="font-display"
        >
          ?
        </text>
        <circle cx={shot.to[0]} cy={shot.to[1] + 0.6} r={0.7} fill="#F2F5F7" />
      </svg>

      <ClueChips clues={clues} revealed={revealed} firstReveal={2} />
    </div>
  );
}
