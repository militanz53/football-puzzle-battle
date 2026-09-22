import type { CareerJourneyPuzzle } from "../types";

/** Stable test fixture, independent of the content in src/data. */
export const careerPuzzle: CareerJourneyPuzzle = {
  id: "test_career",
  type: "career_journey",
  difficulty: "medium",
  question: "Who is the player?",
  correct_answer: "Zlatan Ibrahimović",
  answer_aliases: ["Ibrahimovic", "Zlatan", "Ibra"],
  tags: [],
  status: "published",
  reveal_interval_seconds: 3,
  bot_difficulty: "medium",
  reveal_data: {
    clubs: ["Ajax", "Juventus", "Inter", "Barcelona", "AC Milan", "PSG"],
  },
};
