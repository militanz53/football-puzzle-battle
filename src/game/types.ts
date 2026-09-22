export type Difficulty = "easy" | "medium" | "hard";

export type PuzzleType =
  | "goal_map"
  | "photo_reveal"
  | "missing_xi"
  | "career_journey"
  | "teammate_web";

export type PuzzleStatus = "draft" | "published";

/**
 * Common puzzle record — GDD §24 / §24.1. Field names mirror the future DB row
 * (snake_case) so puzzle data can move to Supabase without renaming.
 */
interface PuzzleBase {
  id: string;
  type: PuzzleType;
  difficulty: Difficulty;
  question: string;
  correct_answer: string;
  /** §26.1 — alternative spellings accepted as exact (normalized) matches. */
  answer_aliases: string[];
  competition?: string;
  season?: string;
  tags: string[];
  status: PuzzleStatus;
  /** §6.1 — fixed at 3 in the MVP; kept per puzzle for later overrides. */
  reveal_interval_seconds: number;
  /** §29.1 — how the bot opponent plays this puzzle. */
  bot_difficulty: Difficulty;
}

export interface CareerJourneyPuzzle extends PuzzleBase {
  type: "career_journey";
  /**
   * Full club career in order. Reveal N shows clubs[0..N-1]; with 5 reveals
   * (§6.1) any clubs beyond the fifth only appear on the round result screen.
   */
  reveal_data: { clubs: string[] };
}

/** Point on a pitch in metres: x across (0-68), y distance from the goal line being attacked. */
export type PitchPoint = [x: number, y: number];

/**
 * Goal Map (§9 Puzzle 1): our own top-down reconstruction of a goal (§35).
 * Reveal 1 is the move itself; reveals 2-5 add the facts in `clues` order.
 */
export interface GoalMapPuzzle extends PuzzleBase {
  type: "goal_map";
  reveal_data: {
    attackers: PitchPoint[];
    defenders: PitchPoint[];
    /** Ball movement before the shot, in order. */
    passes: { from: PitchPoint; to: PitchPoint }[];
    shot: { from: PitchPoint; to: PitchPoint };
    /** Reveals 2-5, in order: competition, season, opponent, minute. */
    clues: { label: string; value: string }[];
  };
}

/**
 * Photo Reveal (§9 Puzzle 2, §9.2.1): original illustration only, never a real photo.
 * The parts open in stages instead of a blur. Parameters feed a placeholder
 * illustration until the commissioned artwork exists.
 */
export interface PhotoRevealPuzzle extends PuzzleBase {
  type: "photo_reveal";
  /** §24.1 — always "illustration" in the MVP. */
  image_source: "illustration";
  /** §24.1 — unused in the MVP (only for a possible real-photo option later). */
  license_type?: string;
  reveal_data: {
    illustration: {
      hair: "curly-long" | "short" | "bald";
      hairColor: string;
      skin: string;
      kit: { primary: string; secondary: string; pattern: "stripes" | "plain" };
      captainArmband: boolean;
      beard: boolean;
    };
    /** Caption per reveal stage (§9.2): hair/kit detail, torso, team colours, face part, full. */
    stage_labels: string[];
  };
}

/** Missing XI (§9.3.1): ten given players on the pitch, one framed empty slot. */
export interface MissingXIPuzzle extends PuzzleBase {
  type: "missing_xi";
  reveal_data: {
    team: string;
    /** Positions in % of the pitch box; y = 0 is the attacking end. */
    lineup: { name: string; number?: number; x: number; y: number; missing?: true }[];
    /** Reveals 1-5, in order: formation, competition, season, opponent, position. */
    clues: { label: string; value: string }[];
  };
}

/** Teammate Web (§9 Puzzle 5): who played with all of these players? */
export interface TeammateWebPuzzle extends PuzzleBase {
  type: "teammate_web";
  /** Reveal 1 shows two players; each later reveal adds one (6 in total). */
  reveal_data: { players: string[] };
}

export type Puzzle =
  | GoalMapPuzzle
  | PhotoRevealPuzzle
  | MissingXIPuzzle
  | CareerJourneyPuzzle
  | TeammateWebPuzzle;
