"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { MatchScreen } from "@/components/match/MatchScreen";
import type { NameEntry } from "@/data/names";
import type { MatchView } from "@/server/match/view";

/**
 * A friendly match (§13.2): the usual match screen. A rematch both accept opens the
 * new match's page; a rematch the friend does not answer leads back to Friends.
 */
export function FriendlyMatch({ initialView, names }: { initialView: MatchView; names: NameEntry[] }) {
  const router = useRouter();
  const backToFriends = useCallback(() => router.push("/friends"), [router]);
  const openMatch = useCallback((view: MatchView) => router.push(`/friendly/${view.id}`), [router]);
  return <MatchScreen key={initialView.id} initialView={initialView} names={names} onSearchAgain={backToFriends} onOpenMatch={openMatch} />;
}
