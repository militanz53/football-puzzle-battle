import type { Puzzle } from "@/game/types";
import { byTypeThenId } from "./rows";

// The layout of src/data/puzzles.json, the backup written by `npm run db:export`.
// Fixed record order and key order keep the file stable, so a re-export only shows
// real content changes in git. The key order matters because Postgres jsonb does not
// keep it: reveal_data comes back with its keys re-sorted (shortest first).

/**
 * Key order at every level: the §24.1 fields, then the reveal_data shapes of
 * src/game/types.ts in declaration order. Keys not listed keep their order, last.
 */
const KEY_ORDER = [
  // record
  "id", "type", "status", "difficulty", "bot_difficulty", "question", "correct_answer", "answer_aliases",
  "competition", "season", "tags", "reveal_interval_seconds", "image_source", "license_type", "reveal_data",
  // goal_map
  "attackers", "defenders", "passes", "shot", "from", "to",
  // photo_reveal
  "illustration", "hair", "hairColor", "skin", "kit", "primary", "secondary", "pattern", "captainArmband", "beard",
  "stage_labels",
  // missing_xi
  "team", "lineup", "name", "number", "x", "y", "missing",
  // shared by goal_map and missing_xi
  "clues", "label", "value",
  // career_journey, teammate_web
  "clubs", "players",
];

function inKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(inKeyOrder);
  if (value === null || typeof value !== "object") return value;
  const rank = (key: string) => (KEY_ORDER.includes(key) ? KEY_ORDER.indexOf(key) : KEY_ORDER.length);
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => rank(a) - rank(b))
      .map(([k, v]) => [k, inKeyOrder(v)]),
  );
}

const INLINE_WIDTH = 100;

/**
 * The records grouped by type in §5 order (then by id), one field per line, with
 * short arrays and objects (points, clues, line-up slots) kept on one line so the
 * file stays readable and diffs stay small.
 */
export function formatPuzzlesJson(puzzles: Puzzle[]): string {
  return format([...puzzles].sort(byTypeThenId).map(inKeyOrder), "") + "\n";
}

function format(value: unknown, indent: string): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const inner = indent + "  ";
  const isArray = Array.isArray(value);
  const entries = isArray
    ? value.map((v) => format(v, inner))
    : Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${JSON.stringify(k)}: ${format(v, inner)}`);
  const [open, close] = isArray ? ["[", "]"] : ["{", "}"];
  if (entries.length === 0) return open + close;

  const oneLine = isArray ? `[${entries.join(", ")}]` : `{ ${entries.join(", ")} }`;
  // The top-level array always expands; nested values go on one line when short.
  if (indent !== "" && !oneLine.includes("\n") && inner.length + oneLine.length <= INLINE_WIDTH) {
    return oneLine;
  }
  return `${open}\n${entries.map((e) => inner + e).join(",\n")}\n${indent}${close}`;
}
