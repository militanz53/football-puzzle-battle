import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROUND_ORDER } from "@/game/match";
import type { Puzzle } from "@/game/types";

// Stand-in for the puzzle table (GDD §24: content must not live inside components).
// Records use the §24 snake_case field names so they can move to Supabase unchanged.
// The file is read on every call, so edits made in /admin reach the next match
// without a rebuild. Replace with a Supabase query once the backend exists.
//
// Server-only: it uses node:fs, so import it from Server Components and Server
// Functions, never from a Client Component.
//
// The first 50 records are the §30 MVP pool. Minutes, seasons, opponents, line-ups,
// shirt numbers and club careers were checked against the English Wikipedia
// match/player pages in September 2026. Pitch drawings (Goal Map move geometry,
// Missing XI placement) are stylised, not traced from footage (§35). Per-puzzle
// sourcing notes are in the git history of src/data/content/ (before the move to JSON).
//
// Difficulty guide, adapted per type from the Career Journey tiers in §9.4:
// - Goal Map: Easy = iconic finals, Medium = famous club goals, Hard = older or group-stage goals.
// - Photo Reveal: Easy = one-of-a-kind look, Medium = well-known star, Hard = less distinctive look.
// - Missing XI: Easy = recent World Cup final + its star, Medium = famous final + key player,
//   Hard = older final + squad player.
// - Career Journey: exactly §9.4 — "Club (years)" / club names only / home cities or countries only.
// - Teammate Web: Easy = superstar connector, Medium = well-known connector, Hard = connector
//   known mainly to regular followers, across three or more clubs.

export const PUZZLES_FILE = path.join(process.cwd(), "src", "data", "puzzles.json");

export function loadPuzzles(file = PUZZLES_FILE): Puzzle[] {
  return JSON.parse(readFileSync(file, "utf8")) as Puzzle[];
}

/** Writes the whole pool, grouped by type in §5 order (stable within a type). */
export function savePuzzles(puzzles: Puzzle[], file = PUZZLES_FILE): void {
  const sorted = [...puzzles]
    .sort((a, b) => ROUND_ORDER.indexOf(a.type) - ROUND_ORDER.indexOf(b.type))
    .map(withFieldOrder);
  // Write then rename, so a crash never leaves a half-written file behind.
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, formatPuzzlesJson(sorted));
  renameSync(tmp, file);
}

/** §24.1 field order, so every record in the file reads the same way. */
const FIELD_ORDER = [
  "id", "type", "status", "difficulty", "bot_difficulty", "question", "correct_answer", "answer_aliases",
  "competition", "season", "tags", "reveal_interval_seconds", "image_source", "license_type", "reveal_data",
];

function withFieldOrder(puzzle: Puzzle): Puzzle {
  const rank = (key: string) => (FIELD_ORDER.includes(key) ? FIELD_ORDER.indexOf(key) : FIELD_ORDER.length);
  return Object.fromEntries(Object.entries(puzzle).sort(([a], [b]) => rank(a) - rank(b))) as Puzzle;
}

const INLINE_WIDTH = 100;

/**
 * JSON with one puzzle field per line, but short arrays and objects (points, clues,
 * line-up slots) kept on one line so the file stays readable and diffs stay small.
 */
export function formatPuzzlesJson(puzzles: Puzzle[]): string {
  return format(puzzles, "") + "\n";
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
