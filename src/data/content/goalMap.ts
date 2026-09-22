import type { GoalMapPuzzle } from "@/game/types";
import { shared } from "./shared";

// Coordinates: metres in the attacking third, x across (0-68, attacker's left = 0),
// y distance from the goal line; goal mouth is x 30.34-37.66. Geometry is a stylised
// sketch of the move; the clue values are the sourced facts.

type Clues = [competition: string, when: string, opponent: string, minute: string];

function clues([competition, when, opponent, minute]: Clues, whenLabel = "Season") {
  return [
    { label: "Competition", value: competition },
    { label: whenLabel, value: when },
    { label: "Opponent", value: opponent },
    { label: "Minute", value: minute },
  ];
}

export const goalMapPuzzles: GoalMapPuzzle[] = [
  {
    ...shared,
    id: "goal_001",
    type: "goal_map",
    difficulty: "medium",
    question: "Who scored?",
    correct_answer: "Lionel Messi",
    answer_aliases: ["Messi", "Leo Messi", "Leo"],
    competition: "Champions League",
    season: "2014/15",
    tags: ["barcelona", "semi-final"],
    reveal_data: {
      attackers: [[57, 31], [47, 20], [33, 13], [21, 19]],
      defenders: [[34, 1.5], [43, 13], [36, 9], [27, 10], [51, 25], [37, 22]],
      passes: [{ from: [57, 31], to: [47, 20] }],
      shot: { from: [47, 20], to: [37.2, 0] },
      clues: clues(["Champions League", "2014/15", "Bayern Munich", "77'"]),
    },
  },

  // --- Easy -----------------------------------------------------------------
  {
    ...shared,
    id: "goal_002",
    type: "goal_map",
    difficulty: "easy",
    question: "Who scored?",
    correct_answer: "Andrés Iniesta",
    answer_aliases: ["Iniesta", "Don Andrés"],
    competition: "FIFA World Cup",
    season: "2010",
    tags: ["spain", "world-cup-final", "extra-time"],
    // Fàbregas's pass into the box; Iniesta finishes (116').
    reveal_data: {
      attackers: [[34, 25], [44, 11], [26, 14], [52, 20]],
      defenders: [[34, 1.5], [40, 8], [31, 9], [46, 15], [36, 18], [24, 12]],
      passes: [{ from: [34, 25], to: [44, 11] }],
      shot: { from: [44, 11], to: [31.5, 0] },
      clues: clues(["World Cup Final", "2010", "Netherlands", "116'"], "Year"),
    },
  },
  {
    ...shared,
    id: "goal_003",
    type: "goal_map",
    difficulty: "easy",
    question: "Who scored?",
    correct_answer: "Mario Götze",
    answer_aliases: ["Götze", "Goetze", "Mario Goetze"],
    competition: "FIFA World Cup",
    season: "2014",
    tags: ["germany", "world-cup-final", "extra-time"],
    // Schürrle runs down the left and crosses; Götze chests it and volleys left-footed (113').
    reveal_data: {
      attackers: [[7, 20], [28, 6], [38, 14]],
      defenders: [[34, 1.5], [26, 9], [33, 6], [14, 18], [40, 10]],
      passes: [{ from: [7, 20], to: [28, 6] }],
      shot: { from: [28, 6], to: [36.8, 0] },
      clues: clues(["World Cup Final", "2014", "Argentina", "113'"], "Year"),
    },
  },
  {
    ...shared,
    id: "goal_004",
    type: "goal_map",
    difficulty: "easy",
    question: "Who scored?",
    correct_answer: "Zinedine Zidane",
    answer_aliases: ["Zidane", "Zizou", "Zinedine"],
    competition: "Champions League",
    season: "2001/02",
    tags: ["real-madrid", "final", "volley"],
    // Looping ball in from the left; Zidane's left-footed volley into the top corner (45').
    reveal_data: {
      attackers: [[8, 27], [27, 17], [40, 12]],
      defenders: [[34, 1.5], [30, 10], [38, 8], [22, 20], [45, 16]],
      passes: [{ from: [8, 27], to: [27, 17] }],
      shot: { from: [27, 17], to: [31.2, 0] },
      clues: clues(["Champions League Final", "2001/02", "Bayer Leverkusen", "45'"]),
    },
  },

  // --- Medium ---------------------------------------------------------------
  {
    ...shared,
    id: "goal_005",
    type: "goal_map",
    difficulty: "medium",
    question: "Who scored?",
    correct_answer: "Sergio Ramos",
    answer_aliases: ["Ramos"],
    competition: "Champions League",
    season: "2013/14",
    tags: ["real-madrid", "final", "header", "stoppage-time"],
    // Modrić's corner from the right; headed into the left of the net (90+3').
    reveal_data: {
      attackers: [[68, 0], [36, 9], [30, 6], [42, 12]],
      defenders: [[34, 1.5], [33, 8], [39, 7], [28, 10], [44, 9]],
      passes: [{ from: [68, 0], to: [36, 9] }],
      shot: { from: [36, 9], to: [31, 0] },
      clues: clues(["Champions League Final", "2013/14", "Atlético Madrid", "90+3'"]),
    },
  },
  {
    ...shared,
    id: "goal_006",
    type: "goal_map",
    difficulty: "medium",
    question: "Who scored?",
    correct_answer: "Sergio Agüero",
    answer_aliases: ["Agüero", "Aguero", "Kun Agüero", "Kun"],
    competition: "Premier League",
    season: "2011/12",
    tags: ["manchester-city", "title-decider", "stoppage-time"],
    // One-two with Balotelli on the edge of the box, then the finish (93:20 on the clock).
    reveal_data: {
      attackers: [[40, 24], [36, 17], [44, 12]],
      defenders: [[34, 1.5], [38, 10], [32, 11], [42, 18], [47, 9], [29, 16]],
      passes: [
        { from: [40, 24], to: [36, 17] },
        { from: [36, 17], to: [44, 12] },
      ],
      shot: { from: [44, 12], to: [37, 0] },
      clues: clues(["Premier League", "2011/12", "Queens Park Rangers", "90+4'"]),
    },
  },
  {
    ...shared,
    id: "goal_007",
    type: "goal_map",
    difficulty: "medium",
    question: "Who scored?",
    correct_answer: "Gareth Bale",
    answer_aliases: ["Bale"],
    competition: "Champions League",
    season: "2017/18",
    tags: ["real-madrid", "final", "bicycle-kick"],
    // Marcelo's cross from the left; bicycle kick (63').
    reveal_data: {
      attackers: [[9, 18], [33, 11], [44, 9]],
      defenders: [[34, 1.5], [30, 7], [38, 8], [26, 13], [45, 14]],
      passes: [{ from: [9, 18], to: [33, 11] }],
      shot: { from: [33, 11], to: [35.5, 0] },
      clues: clues(["Champions League Final", "2017/18", "Liverpool", "63'"]),
    },
  },

  // --- Hard -----------------------------------------------------------------
  {
    ...shared,
    id: "goal_008",
    type: "goal_map",
    difficulty: "hard",
    question: "Who scored?",
    correct_answer: "Ole Gunnar Solskjær",
    answer_aliases: ["Solskjær", "Solskjaer", "Ole Gunnar Solskjaer", "Ole"],
    competition: "Champions League",
    season: "1998/99",
    tags: ["manchester-united", "final", "stoppage-time"],
    // Beckham's corner, Sheringham nods it across goal, Solskjær pokes it into the roof (90+3').
    // The corner is drawn from the right; the side was not source-checked.
    reveal_data: {
      attackers: [[68, 0], [37, 7], [33, 3.5], [28, 9]],
      defenders: [[34, 1.2], [35, 6], [40, 5], [30, 7], [43, 10]],
      passes: [
        { from: [68, 0], to: [37, 7] },
        { from: [37, 7], to: [33, 3.5] },
      ],
      shot: { from: [33, 3.5], to: [33.8, 0] },
      clues: clues(["Champions League Final", "1998/99", "Bayern Munich", "90+3'"]),
    },
  },
  {
    ...shared,
    id: "goal_009",
    type: "goal_map",
    difficulty: "hard",
    question: "Who scored?",
    correct_answer: "Robin van Persie",
    answer_aliases: ["Van Persie", "RVP"],
    competition: "FIFA World Cup",
    season: "2014",
    tags: ["netherlands", "group-stage", "header"],
    // Daley Blind's long ball from the left; diving looping header over Casillas (44').
    reveal_data: {
      attackers: [[7, 35], [33, 15], [46, 20]],
      defenders: [[34, 5], [31, 12], [38, 13], [27, 18], [44, 16]],
      passes: [{ from: [7, 35], to: [33, 15] }],
      shot: { from: [33, 15], to: [35, 0] },
      clues: clues(["World Cup · Group B", "2014", "Spain", "44'"], "Year"),
    },
  },
  {
    ...shared,
    id: "goal_010",
    type: "goal_map",
    difficulty: "hard",
    question: "Who scored?",
    correct_answer: "Marco van Basten",
    answer_aliases: ["Van Basten"],
    competition: "UEFA European Championship",
    season: "1988",
    tags: ["netherlands", "final", "volley"],
    // Mühren's high cross from the left to the far side; volley from a tight angle (53').
    reveal_data: {
      attackers: [[5, 22], [55, 8], [36, 12]],
      defenders: [[34, 1.5], [48, 6], [38, 8], [30, 9], [44, 14]],
      passes: [{ from: [5, 22], to: [55, 8] }],
      shot: { from: [55, 8], to: [36.8, 0] },
      clues: clues(["Euro Final", "1988", "Soviet Union", "53'"], "Year"),
    },
  },
];
