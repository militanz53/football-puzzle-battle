// Copies src/data/puzzles.json (the pre-Supabase content, kept as a backup) into the
// Supabase `puzzles` table, drafts included, with each record's own status.
//
//   npm run db:seed               add the records the table does not have yet
//   npm run db:seed -- --dry-run  only validate and report
//   npm run db:seed -- --overwrite  also replace rows that already exist (their
//                                   later edits in /admin are lost)
//
// Needs the table from supabase/migrations/…_create_puzzles.sql and the keys in
// .env.local. Uses the secret key, so it runs on your machine only.

import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { PUZZLES_TABLE, puzzleToRow } from "@/data/rows";
import { validatePool } from "@/data/schema";
import { ROUND_ORDER } from "@/game/match";
import type { Puzzle } from "@/game/types";
import { secretSupabaseKey, supabaseUrl } from "@/lib/supabase/env";

const dryRun = process.argv.includes("--dry-run");
const overwrite = process.argv.includes("--overwrite");

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function summary(puzzles: Pick<Puzzle, "type" | "status">[]): string {
  return ROUND_ORDER.map((type) => {
    const ofType = puzzles.filter((p) => p.type === type);
    const drafts = ofType.filter((p) => p.status === "draft").length;
    return `  ${type.padEnd(15)} ${String(ofType.length).padStart(3)}${drafts ? ` (${drafts} draft)` : ""}`;
  }).join("\n");
}

async function main() {
  loadEnvConfig(process.cwd(), true);
  const file = path.join(process.cwd(), "src", "data", "puzzles.json");
  const puzzles = JSON.parse(readFileSync(file, "utf8")) as Puzzle[];
  console.log(`Read ${puzzles.length} puzzles from ${path.relative(process.cwd(), file)}:\n${summary(puzzles)}`);

  const problems = validatePool(puzzles);
  if (problems.length > 0) {
    const lines = problems.flatMap((p) => p.issues.map((i) => `  ${p.id} ${i.path}: ${i.message}`));
    fail(`The backup does not pass validation; nothing was written.\n${lines.join("\n")}`);
  }
  console.log("✓ All records pass validation.");
  if (dryRun) return console.log("Dry run: nothing written.");

  const db = createClient(supabaseUrl(), secretSupabaseKey(), { auth: { persistSession: false } });

  const existing = await db.from(PUZZLES_TABLE).select("id");
  if (existing.error) {
    if (existing.error.code === "PGRST205") {
      fail("The puzzles table does not exist yet. Run supabase/migrations/20260925120000_create_puzzles.sql in the Supabase SQL Editor first.");
    }
    fail(`Could not read the table: ${existing.error.message}`);
  }
  const present = new Set(existing.data.map((r) => r.id as string));
  const toWrite = overwrite ? puzzles : puzzles.filter((p) => !present.has(p.id));
  const skipped = puzzles.length - toWrite.length;

  if (toWrite.length > 0) {
    const { error } = await db.from(PUZZLES_TABLE).upsert(toWrite.map(puzzleToRow), { onConflict: "id" });
    if (error) fail(`Write failed, nothing was changed: ${error.message} (${error.code})`);
  }
  console.log(
    `✓ ${overwrite ? "Wrote" : "Added"} ${toWrite.length} row(s)` +
      (skipped ? `; left ${skipped} existing row(s) untouched (use --overwrite to replace them).` : "."),
  );

  const after = await db.from(PUZZLES_TABLE).select("type, status");
  if (after.error) fail(`Could not re-read the table: ${after.error.message}`);
  console.log(`Table now holds ${after.data.length} puzzles:\n${summary(after.data as Pick<Puzzle, "type" | "status">[])}`);
}

main().catch((e) => fail((e as Error).message));
