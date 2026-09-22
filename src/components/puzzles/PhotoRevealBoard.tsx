import type { PhotoRevealPuzzle } from "@/game/types";

type Params = PhotoRevealPuzzle["reveal_data"]["illustration"];

const SILHOUETTE = "#1E2A3D";
const NEUTRAL_SHIRT = "#3A4A62";
const ARMBAND = "#F2C94C";
const FEATURE = "#2A1D14";

const TORSO = "M28 200 C28 160 54 138 100 136 C146 138 172 160 172 200 Z";
const HEAD = { cx: 100, cy: 86, rx: 29, ry: 35 };

// Zoom per stage: starts cropped on the hair/collar, ends on the full bust (§9.2).
const ZOOM = [1.55, 1.35, 1.18, 1.06, 1];

const CURLS: [number, number, number][] = [
  [74, 60, 16], [89, 49, 17], [107, 47, 17], [124, 55, 16], [133, 72, 14], [67, 76, 14],
  [66, 97, 13], [134, 94, 13], [70, 116, 12], [130, 116, 12], [77, 129, 10], [123, 129, 10],
];

function Hair({ style, color }: { style: Params["hair"]; color: string }) {
  if (style === "bald") return null;
  if (style === "short") {
    return <path d="M71 80 C70 52 86 44 100 44 C114 44 130 52 129 80 C122 64 110 60 100 60 C90 60 78 64 71 80 Z" fill={color} />;
  }
  return (
    <g fill={color}>
      {CURLS.map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} />
      ))}
    </g>
  );
}

/**
 * Placeholder illustration (§9.2.1): a parametrised bust whose parts open in
 * stages instead of blurring a photo. The commissioned artwork replaces it later.
 */
export function Illustration({ params, stage }: { params: Params; stage: number }) {
  const zoom = ZOOM[Math.min(stage, ZOOM.length) - 1];
  const colours = stage >= 3;
  const torso = stage >= 2;

  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label="Player illustration">
      <defs>
        <clipPath id="pr-torso">
          <path d={TORSO} />
        </clipPath>
        <clipPath id="pr-lower-face">
          <rect x={60} y={92} width={80} height={60} />
        </clipPath>
      </defs>

      <g
        style={{ transform: `scale(${zoom})`, transformOrigin: "100px 96px" }}
        className="transition-transform duration-700 ease-out"
      >
        {/* Silhouette of the whole bust, always present */}
        <path d={TORSO} fill={SILHOUETTE} />
        <rect x={86} y={110} width={28} height={32} rx={8} fill={SILHOUETTE} />
        <ellipse {...HEAD} fill={SILHOUETTE} />

        {/* 2 — torso shape, still without team colours */}
        {torso && <path d={TORSO} fill={NEUTRAL_SHIRT} className="motion-safe:animate-reveal" />}

        {/* 3 — team colours */}
        {colours && (
          <g clipPath="url(#pr-torso)" className="motion-safe:animate-reveal">
            <rect x={0} y={130} width={200} height={70} fill={params.kit.primary} />
            {params.kit.pattern === "stripes" &&
              Array.from({ length: 8 }, (_, i) => (
                <rect key={i} x={30 + i * 22} y={130} width={11} height={70} fill={params.kit.secondary} />
              ))}
          </g>
        )}

        {/* 4 — lower part of the face; 5 — full face */}
        {stage >= 4 && (
          <g className="motion-safe:animate-reveal">
            <rect x={86} y={110} width={28} height={32} rx={8} fill={params.skin} />
            <ellipse {...HEAD} fill={params.skin} clipPath={stage >= 5 ? undefined : "url(#pr-lower-face)"} />
            <path d="M89 104 Q100 111 111 104" stroke={FEATURE} strokeWidth={2.4} fill="none" strokeLinecap="round" />
            {params.beard && <path d="M76 98 Q100 132 124 98 Q100 118 76 98 Z" fill={params.hairColor} opacity={0.7} />}
          </g>
        )}
        {stage >= 5 && (
          <g className="motion-safe:animate-reveal">
            <ellipse cx={71} cy={88} rx={4} ry={7} fill={params.skin} />
            <ellipse cx={129} cy={88} rx={4} ry={7} fill={params.skin} />
            <ellipse cx={89} cy={82} rx={3.2} ry={3.6} fill={FEATURE} />
            <ellipse cx={111} cy={82} rx={3.2} ry={3.6} fill={FEATURE} />
            <path d="M82 73 L95 71 M105 71 L118 73" stroke={params.hairColor} strokeWidth={3} strokeLinecap="round" />
            <path d="M100 84 L97 96 L102 96" stroke={FEATURE} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}

        {/* 1 — hair and a kit detail (collar, captain's armband) */}
        <Hair style={params.hair} color={params.hairColor} />
        <path d="M86 138 L100 154 L114 138" stroke={params.kit.secondary} strokeWidth={4} fill="none" strokeLinejoin="round" />
        {params.captainArmband && (
          <g>
            <path d="M143 150 L160 158 L155 170 L138 162 Z" fill={ARMBAND} />
            <text x={149} y={163} fontSize={8} fontWeight={700} textAnchor="middle" fill="#0B1220" transform="rotate(25 149 163)">
              C
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}

/** Photo Reveal (§9 Puzzle 2) with an original illustration, never a real photo. */
export function PhotoRevealBoard({ puzzle, revealed }: { puzzle: PhotoRevealPuzzle; revealed: number }) {
  const { illustration, stage_labels } = puzzle.reveal_data;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="aspect-square w-full max-w-[15rem] overflow-hidden rounded-xl border border-border-subtle bg-bg-primary">
        <Illustration params={illustration} stage={revealed} />
      </div>
      <p className="font-display text-xs font-semibold uppercase tracking-widest text-text-secondary">
        <span className="text-text-muted">Clue {revealed}/5 · </span>
        <span key={revealed} className="text-accent motion-safe:animate-reveal">
          {stage_labels[revealed - 1]}
        </span>
      </p>
    </div>
  );
}
