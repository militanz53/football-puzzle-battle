import type { Metadata } from "next";
import { connection } from "next/server";
import { MatchScreen } from "@/components/match/MatchScreen";
import { buildNameIndex } from "@/data/names";
import { fetchPublishedPuzzles } from "@/data/puzzles";
import { createMatch, defaultDeps } from "@/server/match/runner";

export const metadata: Metadata = {
  title: "Match · Football Puzzle Battle",
};

export default async function MatchPage() {
  // A new server-side match per visit (§27): the server draws the puzzles and will run
  // the rounds; the first one starts when the screen is up. The browser gets the
  // match view (no answers, no bot plan) and the autocomplete names.
  await connection();
  const pool = await fetchPublishedPuzzles();
  const view = await createMatch({ ...defaultDeps(), loadPool: async () => pool });
  return <MatchScreen initialView={view} names={buildNameIndex(pool)} />;
}
