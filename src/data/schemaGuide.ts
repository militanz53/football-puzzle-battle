import type { Puzzle } from "@/game/types";

// The bulk-import format as shown in /admin ("Show example format"), written so it
// can be pasted straight into an AI tool. schema.test.ts checks that the example
// passes validation, so the two cannot drift apart.

type Optional = "id" | "status" | "bot_difficulty" | "reveal_interval_seconds";
type ExampleRecord = Puzzle extends infer P ? (P extends Puzzle ? Omit<P, Optional> : never) : never;

export const SCHEMA_GUIDE = `Football Puzzle Battle — puzzle import format

Return ONLY a JSON array of puzzle objects (no comments, no trailing commas).

Fields shared by every type:
- type (required): "goal_map" | "photo_reveal" | "missing_xi" | "career_journey" | "teammate_web"
- difficulty (required): "easy" | "medium" | "hard"
- question (required): string, e.g. "Who scored?"
- correct_answer (required): the player's full name, e.g. "Andrea Pirlo"
- answer_aliases (required): array of other accepted spellings/nicknames (may be []).
  Matching ignores case, accents and extra spaces, so "Kaka" for "Kaká" is not needed but harmless.
- tags (optional, default []): array of short lowercase strings
- competition, season (optional): strings
- id (optional): lowercase letters, digits, _ or -. Leave it out and one is assigned.
- status (optional, default "published"): "published" | "draft"
- bot_difficulty (optional, default "medium"): "easy" | "medium" | "hard"
- reveal_interval_seconds (optional, default 3): must be 3
- Any other field is rejected.

Every puzzle is shown in 5 reveals, from hardest clue to easiest.

goal_map — "Who scored?" A top-down sketch of the goal, then 4 facts.
  reveal_data.attackers: array of [x, y] points (at least 1). One of them must equal shot.from (the scorer).
  reveal_data.defenders: array of [x, y] points (goalkeeper included).
  reveal_data.passes: array of { "from": [x, y], "to": [x, y] }, in order (may be []).
  reveal_data.shot: { "from": [x, y], "to": [x, y] }
  reveal_data.clues: at least 4 { "label", "value" } — Competition, Season (or Year), Opponent, Minute.
  Coordinates are metres: x across the pitch 0-68 (attacker's left = 0), y distance from the goal
  line 0-36. The goal mouth is x 30.34-37.66 at y 0; the goalkeeper usually stands near [34, 1.5].

photo_reveal — "Who is the player?" An original illustration (never a real photo).
  reveal_data.illustration.hair: "curly-long" | "short" | "bald"
  reveal_data.illustration.hairColor, skin: colours like "#3B2A1E"
  reveal_data.illustration.kit: { "primary": "#RRGGBB", "secondary": "#RRGGBB", "pattern": "stripes" | "plain" }
  reveal_data.illustration.captainArmband, beard: true | false
  reveal_data.stage_labels: at least 5 captions, normally
    ["Hair & kit detail", "Torso", "Team colours", "Part of the face", "Full illustration"]
  image_source (optional): only "illustration". license_type (optional): string.

missing_xi — "Who is missing?" A starting XI with one empty slot.
  reveal_data.team: string
  reveal_data.lineup: exactly 11 { "name", "number" (optional, 1-99), "x", "y" }, names unique.
    Exactly one slot has "missing": true (the answer). x and y are % of the pitch (0-100),
    y = 0 is the attacking end, so the goalkeeper is near { "x": 50, "y": 92 }.
  reveal_data.clues: at least 5 { "label", "value" } — Formation, Competition, Season (or Year),
    Opponent, Position.

career_journey — "Who is the player?" The club career, one club per reveal.
  reveal_data.clubs: at least 5 strings, in order. By difficulty:
    easy = "Club (years)", medium = club names, hard = home city or country only.

teammate_web — "Which player connects them?" Players who all played with the answer.
  reveal_data.players: at least 6 names, hardest first (reveal 1 shows two, each reveal adds one).
  None of them may be the answer itself.

Example (one of each type):`;

export const EXAMPLE_IMPORT: ExampleRecord[] = [
  {
    type: "goal_map",
    difficulty: "medium",
    question: "Who scored?",
    correct_answer: "Didier Drogba",
    answer_aliases: ["Drogba"],
    competition: "Champions League",
    season: "2011/12",
    tags: ["chelsea", "final", "header"],
    reveal_data: {
      attackers: [[67.5, 0.5], [33, 6], [40, 9]],
      defenders: [[34, 1.5], [32, 5], [38, 7], [29, 9]],
      passes: [{ from: [67.5, 0.5], to: [33, 6] }],
      shot: { from: [33, 6], to: [31, 0] },
      clues: [
        { label: "Competition", value: "Champions League Final" },
        { label: "Season", value: "2011/12" },
        { label: "Opponent", value: "Bayern Munich" },
        { label: "Minute", value: "88'" },
      ],
    },
  },
  {
    type: "photo_reveal",
    difficulty: "medium",
    question: "Who is the player?",
    correct_answer: "Dennis Bergkamp",
    answer_aliases: ["Bergkamp"],
    tags: ["arsenal", "forward"],
    image_source: "illustration",
    reveal_data: {
      illustration: {
        hair: "short",
        hairColor: "#8A6A45",
        skin: "#E8B896",
        kit: { primary: "#EF0107", secondary: "#FFFFFF", pattern: "plain" },
        captainArmband: false,
        beard: false,
      },
      stage_labels: ["Hair & kit detail", "Torso", "Team colours", "Part of the face", "Full illustration"],
    },
  },
  {
    type: "missing_xi",
    difficulty: "medium",
    question: "Who is missing?",
    correct_answer: "Jordi Alba",
    answer_aliases: ["Alba"],
    competition: "UEFA Euro",
    season: "2012",
    tags: ["spain", "final"],
    reveal_data: {
      team: "Spain",
      lineup: [
        { name: "Iniesta", number: 6, x: 18, y: 16 },
        { name: "Fàbregas", number: 10, x: 50, y: 12 },
        { name: "Silva", number: 21, x: 82, y: 16 },
        { name: "Xabi Alonso", number: 14, x: 25, y: 42 },
        { name: "Busquets", number: 16, x: 50, y: 50 },
        { name: "Xavi", number: 8, x: 75, y: 42 },
        { name: "Jordi Alba", number: 18, x: 12, y: 70, missing: true },
        { name: "Ramos", number: 15, x: 37, y: 74 },
        { name: "Piqué", number: 3, x: 63, y: 74 },
        { name: "Arbeloa", number: 17, x: 88, y: 70 },
        { name: "Casillas", number: 1, x: 50, y: 92 },
      ],
      clues: [
        { label: "Formation", value: "4-3-3" },
        { label: "Competition", value: "UEFA Euro Final" },
        { label: "Year", value: "2012" },
        { label: "Opponent", value: "Italy" },
        { label: "Position", value: "Left Back" },
      ],
    },
  },
  {
    type: "career_journey",
    difficulty: "medium",
    question: "Who is the player?",
    correct_answer: "Kaká",
    answer_aliases: ["Ricardo Kaká"],
    tags: ["midfielder", "brazil"],
    reveal_data: { clubs: ["São Paulo", "AC Milan", "Real Madrid", "AC Milan", "Orlando City"] },
  },
  {
    type: "teammate_web",
    difficulty: "medium",
    question: "Which player connects them?",
    correct_answer: "Andrea Pirlo",
    answer_aliases: ["Pirlo"],
    tags: ["midfielder", "italy"],
    reveal_data: { players: ["Frank Lampard", "Roberto Baggio", "Clarence Seedorf", "Paul Pogba", "Kaká", "Gianluigi Buffon"] },
  },
];

/** Guide plus example, ready to paste into an AI tool. */
export const SCHEMA_PROMPT = `${SCHEMA_GUIDE}\n\n${JSON.stringify(EXAMPLE_IMPORT, null, 2)}\n`;
