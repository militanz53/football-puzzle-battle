import type { Metadata } from "next";
import { MatchScreen } from "@/components/match/MatchScreen";
import { PUZZLES } from "@/data/puzzles";

export const metadata: Metadata = {
  title: "Match · Football Puzzle Battle",
};

export default function MatchPage() {
  return <MatchScreen pool={PUZZLES} />;
}
