import type { Metadata } from "next";
import { connection } from "next/server";
import { MatchScreen } from "@/components/match/MatchScreen";
import { PUZZLES } from "@/data/puzzles";
import { drawSchedule } from "./actions";

export const metadata: Metadata = {
  title: "Match · Football Puzzle Battle",
};

export default async function MatchPage() {
  // Draw the schedule per request, not at build time, so every match differs and
  // the server-rendered first round matches what the client hydrates.
  await connection();
  return (
    <MatchScreen pool={PUZZLES} initialSchedule={await drawSchedule()} drawSchedule={drawSchedule} />
  );
}
