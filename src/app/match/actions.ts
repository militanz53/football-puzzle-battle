"use server";

import { loadPuzzles } from "@/data/puzzles";
import { buildSchedule } from "@/game/match";
import type { Puzzle } from "@/game/types";

/** Draws a match's 5 puzzles on the server (§27: the server owns puzzle selection). */
export async function drawSchedule(): Promise<Puzzle[]> {
  return buildSchedule(loadPuzzles(), Math.random);
}
