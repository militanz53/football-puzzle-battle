import type { Metadata } from "next";
import { connection } from "next/server";
import { QuickMatch } from "@/components/match/QuickMatch";
import { buildNameIndex } from "@/data/names";
import { fetchPublishedPuzzles } from "@/data/puzzles";

export const metadata: Metadata = {
  title: "Match · Football Puzzle Battle",
};

export default async function MatchPage() {
  // Quick Match (§13.1): the page opens on the searching screen, which joins the
  // server's queue; the match itself is created on the server once an opponent is
  // found. The browser gets the autocomplete names now (no answers are marked).
  await connection();
  return <QuickMatch names={buildNameIndex(await fetchPublishedPuzzles())} />;
}
