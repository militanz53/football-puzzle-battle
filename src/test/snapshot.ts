import { readFileSync } from "node:fs";
import path from "node:path";
import type { Puzzle } from "@/game/types";

// Tests only. src/data/puzzles.json is the backup the Supabase table was seeded from
// (npm run db:seed); the app no longer reads it. Tests use it as a fixed, offline
// copy of the real content.
export const SNAPSHOT_FILE = path.join(process.cwd(), "src", "data", "puzzles.json");

export function loadSnapshot(): Puzzle[] {
  return JSON.parse(readFileSync(SNAPSHOT_FILE, "utf8")) as Puzzle[];
}
