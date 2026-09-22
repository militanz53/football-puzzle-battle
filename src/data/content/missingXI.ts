import type { MissingXIPuzzle } from "@/game/types";
import { shared } from "./shared";

// Starting XIs, shirt numbers and position labels are from the Wikipedia match pages.
// Formations are derived from those position labels. Where a page lists two players
// in the same role (e.g. CB, CB) they are placed in listed order, right to left; which
// side each actually played was not checked.

type Slot = MissingXIPuzzle["reveal_data"]["lineup"][number];
const p = (name: string, number: number, x: number, y: number, missing?: true): Slot =>
  missing ? { name, number, x, y, missing } : { name, number, x, y };

type Clues = [formation: string, competition: string, when: string, opponent: string, position: string];

function clues([formation, competition, when, opponent, position]: Clues, whenLabel = "Season") {
  return [
    { label: "Formation", value: formation },
    { label: "Competition", value: competition },
    { label: whenLabel, value: when },
    { label: "Opponent", value: opponent },
    { label: "Position", value: position },
  ];
}

export const missingXIPuzzles: MissingXIPuzzle[] = [
  {
    ...shared,
    id: "missing_001",
    type: "missing_xi",
    difficulty: "medium",
    question: "Who is missing?",
    correct_answer: "Pedro Rodríguez",
    answer_aliases: ["Pedro", "Pedrito"],
    competition: "Champions League",
    season: "2010/11",
    tags: ["barcelona", "final"],
    reveal_data: {
      team: "Barcelona",
      lineup: [
        p("Villa", 7, 18, 14), p("Messi", 10, 50, 10), p("Pedro", 17, 82, 14, true),
        p("Iniesta", 8, 22, 40), p("Busquets", 16, 50, 50), p("Xavi", 6, 78, 40),
        p("Abidal", 22, 12, 70), p("Mascherano", 14, 37, 74), p("Piqué", 3, 63, 74), p("Alves", 2, 88, 70),
        p("Valdés", 1, 50, 92),
      ],
      clues: clues(["4-3-3", "Champions League Final", "2010/11", "Manchester United", "Right Wing"]),
    },
  },

  // --- Easy -----------------------------------------------------------------
  {
    ...shared,
    id: "missing_002",
    type: "missing_xi",
    difficulty: "easy",
    question: "Who is missing?",
    correct_answer: "Lionel Messi",
    answer_aliases: ["Messi", "Leo Messi", "Leo"],
    competition: "FIFA World Cup",
    season: "2022",
    tags: ["argentina", "world-cup-final"],
    reveal_data: {
      team: "Argentina",
      lineup: [
        p("Di María", 11, 18, 14), p("Álvarez", 9, 50, 10), p("Messi", 10, 82, 14, true),
        p("De Paul", 7, 22, 40), p("E. Fernández", 24, 50, 50), p("Mac Allister", 20, 78, 40),
        p("Tagliafico", 3, 12, 72), p("Otamendi", 19, 37, 75), p("Romero", 13, 63, 75), p("Molina", 26, 88, 72),
        p("E. Martínez", 23, 50, 92),
      ],
      clues: clues(["4-3-3", "World Cup Final", "2022", "France", "Right Forward"], "Year"),
    },
  },
  {
    ...shared,
    id: "missing_003",
    type: "missing_xi",
    difficulty: "easy",
    question: "Who is missing?",
    correct_answer: "Kylian Mbappé",
    answer_aliases: ["Mbappé", "Mbappe", "Kylian Mbappe"],
    competition: "FIFA World Cup",
    season: "2018",
    tags: ["france", "world-cup-final"],
    reveal_data: {
      team: "France",
      lineup: [
        p("Giroud", 9, 50, 10),
        p("Matuidi", 14, 16, 29), p("Griezmann", 7, 50, 31), p("Mbappé", 10, 84, 29, true),
        p("Kanté", 13, 34, 53), p("Pogba", 6, 66, 53),
        p("Hernandez", 21, 12, 73), p("Umtiti", 5, 37, 76), p("Varane", 4, 63, 76), p("Pavard", 2, 88, 73),
        p("Lloris", 1, 50, 93),
      ],
      clues: clues(["4-2-3-1", "World Cup Final", "2018", "Croatia", "Right Wing"], "Year"),
    },
  },
  {
    ...shared,
    id: "missing_004",
    type: "missing_xi",
    difficulty: "easy",
    question: "Who is missing?",
    correct_answer: "Andrés Iniesta",
    answer_aliases: ["Iniesta", "Don Andrés"],
    competition: "FIFA World Cup",
    season: "2010",
    tags: ["spain", "world-cup-final"],
    reveal_data: {
      team: "Spain",
      lineup: [
        p("Villa", 7, 50, 10),
        p("Pedro", 18, 16, 29), p("Xavi", 8, 50, 31), p("Iniesta", 6, 84, 29, true),
        p("Xabi Alonso", 14, 34, 53), p("Busquets", 16, 66, 53),
        p("Capdevila", 11, 12, 73), p("Puyol", 5, 37, 76), p("Piqué", 3, 63, 76), p("Ramos", 15, 88, 73),
        p("Casillas", 1, 50, 93),
      ],
      clues: clues(["4-2-3-1", "World Cup Final", "2010", "Netherlands", "Right Wing"], "Year"),
    },
  },

  // --- Medium ---------------------------------------------------------------
  {
    ...shared,
    id: "missing_005",
    type: "missing_xi",
    difficulty: "medium",
    question: "Who is missing?",
    correct_answer: "Toni Kroos",
    answer_aliases: ["Kroos"],
    competition: "FIFA World Cup",
    season: "2014",
    tags: ["germany", "world-cup-final"],
    // Kramer started and was replaced by Schürrle in the 32nd minute.
    reveal_data: {
      team: "Germany",
      lineup: [
        p("Özil", 8, 18, 14), p("Klose", 11, 50, 10), p("Müller", 13, 82, 14),
        p("Kroos", 18, 20, 42, true), p("Schweinsteiger", 7, 50, 50), p("Kramer", 23, 80, 42),
        p("Höwedes", 4, 12, 72), p("Hummels", 5, 37, 75), p("Boateng", 20, 63, 75), p("Lahm", 16, 88, 72),
        p("Neuer", 1, 50, 92),
      ],
      clues: clues(["4-3-3", "World Cup Final", "2014", "Argentina", "Left Midfield"], "Year"),
    },
  },
  {
    ...shared,
    id: "missing_006",
    type: "missing_xi",
    difficulty: "medium",
    question: "Who is missing?",
    correct_answer: "Marco Materazzi",
    answer_aliases: ["Materazzi"],
    competition: "FIFA World Cup",
    season: "2006",
    tags: ["italy", "world-cup-final"],
    reveal_data: {
      team: "Italy",
      lineup: [
        p("Toni", 9, 50, 9),
        p("Totti", 10, 50, 27),
        p("Perrotta", 20, 13, 47), p("Pirlo", 21, 37, 50), p("Gattuso", 8, 63, 50), p("Camoranesi", 16, 87, 47),
        p("Grosso", 3, 12, 73), p("Materazzi", 23, 37, 76, true), p("Cannavaro", 5, 63, 76), p("Zambrotta", 19, 88, 73),
        p("Buffon", 1, 50, 93),
      ],
      clues: clues(["4-4-1-1", "World Cup Final", "2006", "France", "Centre-Back"], "Year"),
    },
  },
  {
    ...shared,
    id: "missing_007",
    type: "missing_xi",
    difficulty: "medium",
    question: "Who is missing?",
    correct_answer: "Steven Gerrard",
    answer_aliases: ["Gerrard", "Stevie G"],
    competition: "Champions League",
    season: "2004/05",
    tags: ["liverpool", "final"],
    // Wikipedia lists DM, RM, CM, LM, SS, CF; drawn as a central stack behind the striker.
    reveal_data: {
      team: "Liverpool",
      lineup: [
        p("Baroš", 5, 50, 8),
        p("Kewell", 7, 50, 25),
        p("Riise", 6, 14, 42), p("Gerrard", 8, 50, 42, true), p("Luis García", 10, 86, 42),
        p("Xabi Alonso", 14, 50, 59),
        p("Traoré", 21, 12, 76), p("Hyypiä", 4, 37, 78), p("Carragher", 23, 63, 78), p("Finnan", 3, 88, 76),
        p("Dudek", 1, 50, 94),
      ],
      clues: clues(["4-1-3-1-1", "Champions League Final", "2004/05", "AC Milan", "Central Midfield"]),
    },
  },

  // --- Hard -----------------------------------------------------------------
  {
    ...shared,
    id: "missing_008",
    type: "missing_xi",
    difficulty: "hard",
    question: "Who is missing?",
    correct_answer: "Jesper Blomqvist",
    answer_aliases: ["Blomqvist"],
    competition: "Champions League",
    season: "1998/99",
    tags: ["manchester-united", "final"],
    reveal_data: {
      team: "Manchester United",
      lineup: [
        p("Yorke", 19, 36, 13), p("Cole", 9, 64, 13),
        p("Blomqvist", 15, 13, 44, true), p("Butt", 8, 37, 47), p("Beckham", 7, 63, 47), p("Giggs", 11, 87, 44),
        p("Irwin", 3, 12, 73), p("Stam", 6, 37, 76), p("Johnsen", 5, 63, 76), p("G. Neville", 2, 88, 73),
        p("Schmeichel", 1, 50, 93),
      ],
      clues: clues(["4-4-2", "Champions League Final", "1998/99", "Bayern Munich", "Left Midfield"]),
    },
  },
  {
    ...shared,
    id: "missing_009",
    type: "missing_xi",
    difficulty: "hard",
    question: "Who is missing?",
    correct_answer: "Ryan Bertrand",
    answer_aliases: ["Bertrand"],
    competition: "Champions League",
    season: "2011/12",
    tags: ["chelsea", "final"],
    reveal_data: {
      team: "Chelsea",
      lineup: [
        p("Drogba", 11, 50, 10),
        p("Bertrand", 34, 16, 29, true), p("Mata", 10, 50, 31), p("Kalou", 21, 84, 29),
        p("Lampard", 8, 34, 53), p("Mikel", 12, 66, 53),
        p("A. Cole", 3, 12, 73), p("Cahill", 24, 37, 76), p("David Luiz", 4, 63, 76), p("Bosingwa", 17, 88, 73),
        p("Čech", 1, 50, 93),
      ],
      clues: clues(["4-2-3-1", "Champions League Final", "2011/12", "Bayern Munich", "Left Wing"]),
    },
  },
  {
    ...shared,
    id: "missing_010",
    type: "missing_xi",
    difficulty: "hard",
    question: "Who is missing?",
    correct_answer: "Stelios Giannakopoulos",
    answer_aliases: ["Giannakopoulos", "Stelios"],
    competition: "UEFA European Championship",
    season: "2004",
    tags: ["greece", "euro-final"],
    reveal_data: {
      team: "Greece",
      lineup: [
        p("Giannakopoulos", 8, 18, 14, true), p("Vryzas", 15, 50, 10), p("Charisteas", 9, 82, 14),
        p("Basinas", 6, 22, 40), p("Katsouranis", 21, 50, 50), p("Zagorakis", 7, 78, 40),
        p("Fyssas", 14, 12, 72), p("Dellas", 5, 37, 75), p("Kapsis", 19, 63, 75), p("Seitaridis", 2, 88, 72),
        p("Nikopolidis", 1, 50, 92),
      ],
      clues: clues(["4-3-3", "Euro Final", "2004", "Portugal", "Left Wing"], "Year"),
    },
  },
];
