import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { QuickMatch } from "@/components/match/QuickMatch";
import { buildNameIndex } from "@/data/names";
import { fetchPublishedPuzzles } from "@/data/puzzles";
import { currentAccount } from "@/lib/account/auth";

export const metadata: Metadata = {
  title: "Ranked · Football Puzzle Battle",
};

/**
 * Ranked (§13.5): the Quick Match screens and server match, in the ranked lane of the
 * queue, for signed-in accounts only. Signed out, the account screen comes first.
 */
export default async function RankedPage() {
  await connection();
  if (!(await currentAccount())) redirect("/account?next=/ranked");
  return <QuickMatch mode="ranked" names={buildNameIndex(await fetchPublishedPuzzles())} />;
}
