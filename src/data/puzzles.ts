import type { Puzzle } from "@/game/types";
import { careerJourneyPuzzles } from "./content/careerJourney";
import { goalMapPuzzles } from "./content/goalMap";
import { missingXIPuzzles } from "./content/missingXI";
import { photoRevealPuzzles } from "./content/photoReveal";
import { teammateWebPuzzles } from "./content/teammateWeb";

// Stand-in for the puzzle table (GDD §24: content must not live inside components).
// The MVP pool of §30: 10 puzzles per type, 50 in total. Sourcing notes and the
// per-type difficulty guide are in ./content/shared.ts.
// Replace with a Supabase query once the backend exists.

export const PUZZLES: Puzzle[] = [
  ...goalMapPuzzles,
  ...photoRevealPuzzles,
  ...missingXIPuzzles,
  ...careerJourneyPuzzles,
  ...teammateWebPuzzles,
];
