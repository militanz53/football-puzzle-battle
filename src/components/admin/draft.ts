import { MVP_REVEAL_INTERVAL } from "@/data/schema";
import type { Difficulty, Puzzle, PuzzleStatus, PuzzleType } from "@/game/types";

// The admin form edits a Draft: every field as the text the user typed, with a
// section per puzzle type so switching type while creating keeps what was entered.
// draftToRecord turns it back into a raw record for validatePuzzle, which reports
// anything that does not parse (e.g. a point typed as "12, abc").

type Clue = { label: string; value: string };
type Slot = { name: string; number: string; x: string; y: string };

export interface Draft {
  id: string;
  type: PuzzleType;
  status: PuzzleStatus;
  difficulty: Difficulty;
  bot_difficulty: Difficulty;
  question: string;
  correct_answer: string;
  /** Comma-separated. */
  answer_aliases: string;
  /** Comma-separated. */
  tags: string;
  competition: string;
  season: string;
  reveal_interval_seconds: string;
  career: { clubs: string };
  web: { players: string };
  photo: {
    hair: string;
    hairColor: string;
    skin: string;
    primary: string;
    secondary: string;
    pattern: string;
    captainArmband: boolean;
    beard: boolean;
    stage_labels: string;
    license_type: string;
  };
  xi: { team: string; lineup: Slot[]; missing: number; clues: Clue[] };
  goal: {
    /** One "x, y" per line. */
    attackers: string;
    defenders: string;
    /** One "x, y -> x, y" per line. */
    passes: string;
    /** Index into attackers of the player who shoots. */
    scorer: number;
    shotTo: string;
    clues: Clue[];
  };
}

export const DEFAULT_QUESTION: Record<PuzzleType, string> = {
  goal_map: "Who scored?",
  photo_reveal: "Who is the player?",
  missing_xi: "Who is missing?",
  career_journey: "Who is the player?",
  teammate_web: "Which player connects them?",
};

const STAGE_LABELS = ["Hair & kit detail", "Torso", "Team colours", "Part of the face", "Full illustration"];
const clues = (...labels: string[]): Clue[] => labels.map((label) => ({ label, value: "" }));

/** 4-3-3 placement from the existing content, so a new line-up starts in shape. */
const DEFAULT_SLOTS: [number, number][] = [
  [18, 14], [50, 10], [82, 14], [22, 40], [50, 50], [78, 40], [12, 70], [37, 74], [63, 74], [88, 70], [50, 92],
];

export function emptyDraft(type: PuzzleType, id: string): Draft {
  return {
    id,
    type,
    status: "published",
    difficulty: "medium",
    bot_difficulty: "medium",
    question: DEFAULT_QUESTION[type],
    correct_answer: "",
    answer_aliases: "",
    tags: "",
    competition: "",
    season: "",
    reveal_interval_seconds: String(MVP_REVEAL_INTERVAL),
    career: { clubs: "" },
    web: { players: "" },
    photo: {
      hair: "short",
      hairColor: "#3B2A1E",
      skin: "#D2A07C",
      primary: "#DA291C",
      secondary: "#FFFFFF",
      pattern: "plain",
      captainArmband: false,
      beard: false,
      stage_labels: STAGE_LABELS.join("\n"),
      license_type: "",
    },
    xi: {
      team: "",
      lineup: DEFAULT_SLOTS.map(([x, y]) => ({ name: "", number: "", x: String(x), y: String(y) })),
      missing: 0,
      clues: clues("Formation", "Competition", "Season", "Opponent", "Position"),
    },
    goal: {
      attackers: "",
      defenders: "34, 1.5",
      passes: "",
      scorer: 0,
      shotTo: "34, 0",
      clues: clues("Competition", "Season", "Opponent", "Minute"),
    },
  };
}

const point = (p: [number, number]) => `${p[0]}, ${p[1]}`;
const lines = (items: string[]) => items.join("\n");

export function draftFromPuzzle(p: Puzzle): Draft {
  const d: Draft = {
    ...emptyDraft(p.type, p.id),
    status: p.status,
    difficulty: p.difficulty,
    bot_difficulty: p.bot_difficulty,
    question: p.question,
    correct_answer: p.correct_answer,
    answer_aliases: p.answer_aliases.join(", "),
    tags: p.tags.join(", "),
    competition: p.competition ?? "",
    season: p.season ?? "",
    reveal_interval_seconds: String(p.reveal_interval_seconds),
  };
  switch (p.type) {
    case "career_journey":
      d.career = { clubs: lines(p.reveal_data.clubs) };
      break;
    case "teammate_web":
      d.web = { players: lines(p.reveal_data.players) };
      break;
    case "photo_reveal": {
      const { illustration: il, stage_labels } = p.reveal_data;
      d.photo = {
        hair: il.hair,
        hairColor: il.hairColor,
        skin: il.skin,
        primary: il.kit.primary,
        secondary: il.kit.secondary,
        pattern: il.kit.pattern,
        captainArmband: il.captainArmband,
        beard: il.beard,
        stage_labels: lines(stage_labels),
        license_type: p.license_type ?? "",
      };
      break;
    }
    case "missing_xi": {
      const { team, lineup, clues } = p.reveal_data;
      d.xi = {
        team,
        lineup: lineup.map((s) => ({ name: s.name, number: s.number?.toString() ?? "", x: String(s.x), y: String(s.y) })),
        missing: Math.max(0, lineup.findIndex((s) => s.missing)),
        clues: clues.map((c) => ({ ...c })),
      };
      break;
    }
    case "goal_map": {
      const { attackers, defenders, passes, shot, clues } = p.reveal_data;
      d.goal = {
        attackers: lines(attackers.map(point)),
        defenders: lines(defenders.map(point)),
        passes: lines(passes.map((s) => `${point(s.from)} -> ${point(s.to)}`)),
        scorer: Math.max(0, attackers.findIndex((a) => a[0] === shot.from[0] && a[1] === shot.from[1])),
        shotTo: point(shot.to),
        clues: clues.map((c) => ({ ...c })),
      };
      break;
    }
  }
  return d;
}

const splitComma = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const splitLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const optional = (s: string) => (s.trim() === "" ? undefined : s.trim());
/** "" stays missing (the validator says "is required"); anything else becomes a number, maybe NaN. */
const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

/** "12, 3.5" → [12, 3.5]. Anything else is passed through for the validator to reject. */
function parsePoint(text: string): unknown {
  const parts = text.split(",").map((x) => x.trim());
  if (parts.length === 2 && parts.every((x) => x !== "" && Number.isFinite(Number(x)))) {
    return [Number(parts[0]), Number(parts[1])];
  }
  return text;
}

function parseSegment(text: string): unknown {
  const [from, to] = text.split("->");
  return { from: parsePoint(from ?? ""), to: parsePoint(to ?? "") };
}

/** The raw record for validatePuzzle. */
export function draftToRecord(d: Draft): Record<string, unknown> {
  const record: Record<string, unknown> = {
    id: d.id.trim(),
    type: d.type,
    status: d.status,
    difficulty: d.difficulty,
    bot_difficulty: d.bot_difficulty,
    question: d.question,
    correct_answer: d.correct_answer,
    answer_aliases: splitComma(d.answer_aliases),
    competition: optional(d.competition),
    season: optional(d.season),
    tags: splitComma(d.tags),
    reveal_interval_seconds: num(d.reveal_interval_seconds),
  };
  switch (d.type) {
    case "career_journey":
      record.reveal_data = { clubs: splitLines(d.career.clubs) };
      break;
    case "teammate_web":
      record.reveal_data = { players: splitLines(d.web.players) };
      break;
    case "photo_reveal": {
      const ph = d.photo;
      record.image_source = "illustration";
      record.license_type = optional(ph.license_type);
      record.reveal_data = {
        illustration: {
          hair: ph.hair,
          hairColor: ph.hairColor,
          skin: ph.skin,
          kit: { primary: ph.primary, secondary: ph.secondary, pattern: ph.pattern },
          captainArmband: ph.captainArmband,
          beard: ph.beard,
        },
        stage_labels: splitLines(ph.stage_labels),
      };
      break;
    }
    case "missing_xi":
      record.reveal_data = {
        team: d.xi.team,
        lineup: d.xi.lineup.map((s, i) => {
          const slot: Record<string, unknown> = { name: s.name, x: num(s.x), y: num(s.y) };
          if (s.number.trim() !== "") slot.number = Number(s.number);
          if (i === d.xi.missing) slot.missing = true;
          return slot;
        }),
        clues: d.xi.clues,
      };
      break;
    case "goal_map": {
      const attackers = splitLines(d.goal.attackers).map(parsePoint);
      record.reveal_data = {
        attackers,
        defenders: splitLines(d.goal.defenders).map(parsePoint),
        passes: splitLines(d.goal.passes).map(parseSegment),
        shot: { from: attackers[d.goal.scorer], to: parsePoint(d.goal.shotTo) },
        clues: d.goal.clues,
      };
      break;
    }
  }
  for (const key of Object.keys(record)) if (record[key] === undefined) delete record[key];
  return record;
}
