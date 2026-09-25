// Writes the current Supabase `puzzles` table (drafts included) to src/data/puzzles.json,
// replacing the file. The JSON is a backup and the seed source (npm run db:seed);
// nothing at runtime reads it.
//
//   npm run db:export
//
// Run it by hand whenever you want a fresh backup, then commit the file if you want
// the backup in git. Uses the secret key from .env.local, so it runs on your machine.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { formatPuzzlesJson } from "@/data/format";
import { fetchAllPuzzles } from "@/data/puzzles";
import { validatePool } from "@/data/schema";
import { ROUND_ORDER } from "@/game/match";
import type { Puzzle } from "@/game/types";

const FILE = path.join(process.cwd(), "src", "data", "puzzles.json");

function summary(puzzles: Puzzle[]): string {
  return ROUND_ORDER.map((type) => {
    const ofType = puzzles.filter((p) => p.type === type);
    const drafts = ofType.filter((p) => p.status === "draft").length;
    return `  ${type.padEnd(15)} ${String(ofType.length).padStart(3)}${drafts ? ` (${drafts} draft)` : ""}`;
  }).join("\n");
}

async function main() {
  loadEnvConfig(process.cwd(), true);
  const puzzles = await fetchAllPuzzles();
  console.log(`Read ${puzzles.length} puzzles from Supabase:\n${summary(puzzles)}`);
  if (puzzles.length === 0) {
    // An empty table is far more likely a wrong project or key than intended.
    throw new Error("The table is empty; refusing to overwrite the backup with nothing.");
  }

  // A backup keeps what is there, so problems are reported, not fixed or skipped.
  const problems = validatePool(puzzles);
  for (const p of problems) {
    for (const issue of p.issues) console.warn(`  ! ${p.id} ${issue.path}: ${issue.message}`);
  }
  if (problems.length > 0) console.warn(`! ${problems.length} record(s) do not pass validation; exported as they are.`);

  const json = formatPuzzlesJson(puzzles);
  const before = existsSync(FILE) ? readFileSync(FILE, "utf8").replace(/\r\n/g, "\n") : null;
  if (before === json) return console.log(`✓ ${path.relative(process.cwd(), FILE)} is already up to date.`);

  // Write then rename, so an interrupted run never leaves a half-written file.
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, json);
  renameSync(tmp, FILE);
  console.log(`✓ Wrote ${puzzles.length} puzzles to ${path.relative(process.cwd(), FILE)}.`);
}

main().catch((e) => {
  console.error(`\n✗ ${(e as Error).message}`);
  process.exit(1);
});
