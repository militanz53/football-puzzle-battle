import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FriendlyMatch } from "@/components/friends/FriendlyMatch";
import { buildNameIndex } from "@/data/names";
import { fetchPublishedPuzzles } from "@/data/puzzles";
import { readIdentity } from "@/lib/session";
import { defaultDeps, MatchAccessError, MatchNotFoundError, viewMatch } from "@/server/match/runner";

export const metadata: Metadata = { title: "Friendly match · Football Puzzle Battle" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A friendly match made from an accepted challenge. Only the two browsers holding its
 * seats may open it (the same seat check as every match call).
 */
export default async function FriendlyMatchPage({ params }: PageProps<"/friendly/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  // Read-only here: a browser without a session cookie holds no seat anyway.
  const session = (await readIdentity())?.id;
  if (!session) notFound();
  let view;
  try {
    view = await viewMatch(id, defaultDeps(), session);
  } catch (e) {
    if (e instanceof MatchAccessError || e instanceof MatchNotFoundError) notFound();
    throw e;
  }
  if (!view.friendly) notFound();
  return <FriendlyMatch initialView={view} names={buildNameIndex(await fetchPublishedPuzzles())} />;
}
