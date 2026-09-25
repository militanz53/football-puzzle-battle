import type { Metadata } from "next";
import { connection } from "next/server";
import { MatchScreen } from "@/components/match/MatchScreen";
import { fetchPublishedPuzzles } from "@/data/puzzles";
import { buildSchedule } from "@/game/match";
import { drawSchedule } from "./actions";

export const metadata: Metadata = {
  title: "Match · Football Puzzle Battle",
};

export default async function MatchPage() {
  // Draw the schedule per request, not at build time, so every match differs and
  // the server-rendered first round matches what the client hydrates. One query
  // serves both the schedule and the Sudden Death pool; rematch draws via drawSchedule.
  await connection();
  const pool = await fetchPublishedPuzzles();
  return <MatchScreen pool={pool} initialSchedule={buildSchedule(pool, Math.random)} drawSchedule={drawSchedule} />;
}
