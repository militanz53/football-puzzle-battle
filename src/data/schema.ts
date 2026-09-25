import { isCorrectAnswer, normalizeAnswer } from "@/game/answer";
import { ROUND_ORDER } from "@/game/match";
import { REVEAL_COUNT } from "@/game/scoring";
import type { Difficulty, Puzzle, PuzzleType } from "@/game/types";

// Validation for puzzle records (§24.1) coming from the admin form or a bulk import.
// Pure TypeScript, so the browser can check as the user types and the Server
// Functions can re-check before writing. Unknown fields are errors, which catches
// typos such as "answer_alias" in AI-generated JSON.

export interface Issue {
  /** Field path, e.g. `reveal_data.lineup[3].x`; "" for the record itself. */
  path: string;
  message: string;
}

export type Validation = { ok: true; puzzle: Puzzle } | { ok: false; issues: Issue[] };

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
export const STATUSES = ["published", "draft"] as const;
export const HAIR_STYLES = ["curly-long", "short", "bald"] as const;
export const KIT_PATTERNS = ["stripes", "plain"] as const;

/** §6.1: fixed in the MVP; the field exists for later per-puzzle overrides. */
export const MVP_REVEAL_INTERVAL = 3;

/** Goal Map drawing area in metres (see GoalMapBoard): 68 m wide, 36 m deep. */
export const GOAL_MAP_BOUNDS = { width: 68, depth: 36 };

export const ID_PREFIX: Record<PuzzleType, string> = {
  goal_map: "goal",
  photo_reveal: "photo",
  missing_xi: "missing",
  career_journey: "career",
  teammate_web: "teammate",
};

const COMMON_FIELDS = [
  "id", "type", "status", "difficulty", "bot_difficulty", "question", "correct_answer", "answer_aliases",
  "competition", "season", "tags", "reveal_interval_seconds", "reveal_data",
];
const PHOTO_FIELDS = [...COMMON_FIELDS, "image_source", "license_type"];

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9][a-z0-9_-]*$/;

type Obj = Record<string, unknown>;

/** Collects issues while reading an untrusted value field by field. */
class Reader {
  issues: Issue[] = [];

  fail(path: string, message: string): undefined {
    this.issues.push({ path, message });
    return undefined;
  }

  object(value: unknown, path: string, allowed?: string[]): Obj | undefined {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return this.fail(path, value === undefined ? "is required" : "must be an object");
    }
    if (allowed) {
      for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) this.fail(join(path, key), "is not a known field");
      }
    }
    return value as Obj;
  }

  string(o: Obj, key: string, path: string, optional = false): string | undefined {
    const v = o[key];
    const at = join(path, key);
    if (v === undefined || v === null) return optional ? undefined : this.fail(at, "is required");
    if (typeof v !== "string") return this.fail(at, "must be a string");
    if (v.trim() === "") return optional ? undefined : this.fail(at, "must not be empty");
    return v.trim();
  }

  number(o: Obj, key: string, path: string, min: number, max: number, integer = false): number | undefined {
    const v = o[key];
    const at = join(path, key);
    if (v === undefined || v === null) return this.fail(at, "is required");
    if (typeof v !== "number" || !Number.isFinite(v)) return this.fail(at, "must be a number");
    if (integer && !Number.isInteger(v)) return this.fail(at, "must be a whole number");
    if (v < min || v > max) return this.fail(at, `must be between ${min} and ${max}`);
    return v;
  }

  boolean(o: Obj, key: string, path: string): boolean | undefined {
    const v = o[key];
    if (typeof v === "boolean") return v;
    return this.fail(join(path, key), v === undefined ? "is required" : "must be true or false");
  }

  oneOf<T extends string>(o: Obj, key: string, path: string, options: readonly T[], fallback?: T): T | undefined {
    const v = o[key];
    if (v === undefined && fallback !== undefined) return fallback;
    if (typeof v === "string" && (options as readonly string[]).includes(v)) return v as T;
    return this.fail(join(path, key), v === undefined ? "is required" : `must be one of: ${options.join(", ")}`);
  }

  array(o: Obj, key: string, path: string, min = 0): unknown[] | undefined {
    const v = o[key];
    const at = join(path, key);
    if (v === undefined) return this.fail(at, "is required");
    if (!Array.isArray(v)) return this.fail(at, "must be an array");
    if (v.length < min) return this.fail(at, `needs at least ${min} item${min === 1 ? "" : "s"} (has ${v.length})`);
    return v;
  }

  strings(o: Obj, key: string, path: string, min = 0, fallback?: string[]): string[] | undefined {
    if (o[key] === undefined && fallback) return fallback;
    const list = this.array(o, key, path, min);
    if (!list) return undefined;
    const before = this.issues.length;
    const out = list.map((item, i) => {
      if (typeof item !== "string" || item.trim() === "") {
        this.fail(`${join(path, key)}[${i}]`, "must be a non-empty string");
        return "";
      }
      return item.trim();
    });
    return this.issues.length === before ? out : undefined;
  }
}

function join(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

/** Validates one record and returns it normalized: trimmed strings, defaults filled, known fields only. */
export function validatePuzzle(raw: unknown): Validation {
  const r = new Reader();
  const first = r.object(raw, "");
  if (!first) return { ok: false, issues: r.issues };

  const type = r.oneOf(first, "type", "", ROUND_ORDER);
  // Without a known type there is no way to check reveal_data, so stop here.
  if (!type) return { ok: false, issues: r.issues };
  const o = r.object(raw, "", type === "photo_reveal" ? PHOTO_FIELDS : COMMON_FIELDS)!;

  const id = r.string(o, "id", "");
  if (id !== undefined && !ID.test(id)) r.fail("id", "may only use lowercase letters, digits, _ and -");

  const correct_answer = r.string(o, "correct_answer", "");
  const answer_aliases = r.strings(o, "answer_aliases", "");
  answer_aliases?.forEach((alias, i) => {
    if (normalizeAnswer(alias) === "") r.fail(`answer_aliases[${i}]`, "is empty once accents and spaces are removed");
  });

  const reveal_interval_seconds = o.reveal_interval_seconds === undefined
    ? MVP_REVEAL_INTERVAL
    : r.number(o, "reveal_interval_seconds", "", 1, 60);
  if (reveal_interval_seconds !== undefined && reveal_interval_seconds !== MVP_REVEAL_INTERVAL) {
    r.fail("reveal_interval_seconds", `must be ${MVP_REVEAL_INTERVAL} in the MVP (§6.1)`);
  }

  const base = {
    id,
    type,
    status: r.oneOf(o, "status", "", STATUSES, "published"),
    difficulty: r.oneOf(o, "difficulty", "", DIFFICULTIES),
    bot_difficulty: r.oneOf(o, "bot_difficulty", "", DIFFICULTIES, "medium"),
    question: r.string(o, "question", ""),
    correct_answer,
    answer_aliases,
    competition: r.string(o, "competition", "", true),
    season: r.string(o, "season", "", true),
    tags: r.strings(o, "tags", "", 0, []),
    reveal_interval_seconds,
  };

  let extra: Obj = {};
  let reveal_data: Obj | undefined;
  switch (type) {
    case "career_journey": {
      const rd = r.object(o.reveal_data, "reveal_data", ["clubs"]);
      const clubs = rd && r.strings(rd, "clubs", "reveal_data", REVEAL_COUNT);
      reveal_data = clubs && { clubs };
      break;
    }
    case "teammate_web": {
      const rd = r.object(o.reveal_data, "reveal_data", ["players"]);
      // Reveal 1 shows two players, so 5 reveals need 6.
      const players = rd && r.strings(rd, "players", "reveal_data", REVEAL_COUNT + 1);
      reveal_data = players && { players };
      if (players && correct_answer && answer_aliases) {
        const asPuzzle = { correct_answer, answer_aliases } as Puzzle;
        players.forEach((name, i) => {
          if (isCorrectAnswer(name, asPuzzle)) r.fail(`reveal_data.players[${i}]`, "gives the answer away");
        });
      }
      break;
    }
    case "goal_map":
      reveal_data = readGoalMap(r, o.reveal_data);
      break;
    case "photo_reveal": {
      if (o.image_source !== undefined && o.image_source !== "illustration") {
        r.fail("image_source", 'must be "illustration" (§9.2.1: no real photos)');
      }
      extra = { image_source: "illustration", license_type: r.string(o, "license_type", "", true) };
      reveal_data = readPhoto(r, o.reveal_data);
      break;
    }
    case "missing_xi":
      reveal_data = readMissingXI(r, o.reveal_data);
      break;
  }

  if (r.issues.length > 0) return { ok: false, issues: r.issues };
  const puzzle = { ...base, ...extra, reveal_data } as Obj;
  for (const key of Object.keys(puzzle)) if (puzzle[key] === undefined) delete puzzle[key];
  return { ok: true, puzzle: puzzle as unknown as Puzzle };
}

function readClues(r: Reader, rd: Obj, min: number): { label: string; value: string }[] | undefined {
  const list = r.array(rd, "clues", "reveal_data", min);
  if (!list) return undefined;
  const before = r.issues.length;
  const clues = list.map((item, i) => {
    const path = `reveal_data.clues[${i}]`;
    const c = r.object(item, path, ["label", "value"]);
    return { label: c ? r.string(c, "label", path) : "", value: c ? r.string(c, "value", path) : "" };
  });
  return r.issues.length === before ? (clues as { label: string; value: string }[]) : undefined;
}

type Point = [number, number];

function readPoint(r: Reader, value: unknown, path: string): Point | undefined {
  const { width, depth } = GOAL_MAP_BOUNDS;
  if (!Array.isArray(value) || value.length !== 2 || !value.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return r.fail(path, "must be a point [x, y] of two numbers");
  }
  const [x, y] = value as Point;
  if (x < 0 || x > width) return r.fail(path, `x must be between 0 and ${width} (pitch width in metres)`);
  if (y < 0 || y > depth) return r.fail(path, `y must be between 0 and ${depth} (metres from the goal line)`);
  return [x, y];
}

function readSegment(r: Reader, value: unknown, path: string) {
  const s = r.object(value, path, ["from", "to"]);
  if (!s) return undefined;
  const from = readPoint(r, s.from, `${path}.from`);
  const to = readPoint(r, s.to, `${path}.to`);
  return from && to ? { from, to } : undefined;
}

function readGoalMap(r: Reader, value: unknown): Obj | undefined {
  const rd = r.object(value, "reveal_data", ["attackers", "defenders", "passes", "shot", "clues"]);
  if (!rd) return undefined;
  const before = r.issues.length;
  const points = (key: string, min: number) =>
    r.array(rd, key, "reveal_data", min)?.map((p, i) => readPoint(r, p, `reveal_data.${key}[${i}]`));
  const attackers = points("attackers", 1);
  const defenders = points("defenders", 0);
  const passes = r.array(rd, "passes", "reveal_data")?.map((s, i) => readSegment(r, s, `reveal_data.passes[${i}]`));
  const shot = readSegment(r, rd.shot, "reveal_data.shot");
  // Reveal 1 is the move itself; reveals 2-5 are the clues.
  const clues = readClues(r, rd, REVEAL_COUNT - 1);
  if (shot && attackers && !attackers.some((p) => p && p[0] === shot.from[0] && p[1] === shot.from[1])) {
    r.fail("reveal_data.shot.from", "must be one of the attackers (the scorer is highlighted)");
  }
  if (r.issues.length > before) return undefined;
  return { attackers, defenders, passes, shot, clues };
}

function readPhoto(r: Reader, value: unknown): Obj | undefined {
  const rd = r.object(value, "reveal_data", ["illustration", "stage_labels"]);
  if (!rd) return undefined;
  const before = r.issues.length;
  const path = "reveal_data.illustration";
  const il = r.object(rd.illustration, path, ["hair", "hairColor", "skin", "kit", "captainArmband", "beard"]);
  const color = (o: Obj, key: string, at: string) => {
    const v = r.string(o, key, at);
    return v !== undefined && !HEX.test(v) ? r.fail(join(at, key), "must be a colour like #1A2B3C") : v;
  };
  let illustration: Obj | undefined;
  if (il) {
    const kit = r.object(il.kit, `${path}.kit`, ["primary", "secondary", "pattern"]);
    illustration = {
      hair: r.oneOf(il, "hair", path, HAIR_STYLES),
      hairColor: color(il, "hairColor", path),
      skin: color(il, "skin", path),
      kit: kit && {
        primary: color(kit, "primary", `${path}.kit`),
        secondary: color(kit, "secondary", `${path}.kit`),
        pattern: r.oneOf(kit, "pattern", `${path}.kit`, KIT_PATTERNS),
      },
      captainArmband: r.boolean(il, "captainArmband", path),
      beard: r.boolean(il, "beard", path),
    };
  }
  const stage_labels = r.strings(rd, "stage_labels", "reveal_data", REVEAL_COUNT);
  return r.issues.length > before ? undefined : { illustration, stage_labels };
}

function readMissingXI(r: Reader, value: unknown): Obj | undefined {
  const rd = r.object(value, "reveal_data", ["team", "lineup", "clues"]);
  if (!rd) return undefined;
  const before = r.issues.length;
  const team = r.string(rd, "team", "reveal_data");
  const list = r.array(rd, "lineup", "reveal_data");
  let lineup: Obj[] | undefined;
  if (list) {
    if (list.length !== 11) r.fail("reveal_data.lineup", `needs exactly 11 players (has ${list.length})`);
    lineup = list.map((item, i) => {
      const path = `reveal_data.lineup[${i}]`;
      const s = r.object(item, path, ["name", "number", "x", "y", "missing"]);
      if (!s) return {};
      const slot: Obj = { name: r.string(s, "name", path) };
      if (s.number !== undefined) slot.number = r.number(s, "number", path, 1, 99, true);
      slot.x = r.number(s, "x", path, 0, 100);
      slot.y = r.number(s, "y", path, 0, 100);
      if (s.missing !== undefined && s.missing !== false) {
        if (s.missing === true) slot.missing = true;
        else r.fail(`${path}.missing`, "must be true (or left out)");
      }
      return slot;
    });
    const missing = lineup.filter((s) => s.missing).length;
    if (missing !== 1) r.fail("reveal_data.lineup", `needs exactly one player with "missing": true (has ${missing})`);
    const names = lineup.map((s) => s.name).filter(Boolean);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) r.fail("reveal_data.lineup", `player names must be unique (repeated: ${[...new Set(dupes)].join(", ")})`);
  }
  const clues = readClues(r, rd, REVEAL_COUNT);
  return r.issues.length > before ? undefined : { team, lineup, clues };
}

// ---------------------------------------------------------------------------
// Checks against the rest of the pool
// ---------------------------------------------------------------------------

/**
 * Rules that need the other puzzles: unique ids, one puzzle per answer within a
 * type, and at least one published puzzle of every type left (or matches cannot
 * be drawn). `replacing` is the id being edited, if any.
 */
export function checkAgainstPool(puzzle: Puzzle, pool: Puzzle[], replacing?: string): Issue[] {
  const issues: Issue[] = [];
  const others = pool.filter((p) => p.id !== replacing);
  if (others.some((p) => p.id === puzzle.id)) issues.push({ path: "id", message: `"${puzzle.id}" is already used` });
  const answer = normalizeAnswer(puzzle.correct_answer);
  const twin = others.find((p) => p.type === puzzle.type && normalizeAnswer(p.correct_answer) === answer);
  if (twin) issues.push({ path: "correct_answer", message: `${twin.id} already has this answer` });
  issues.push(...checkPublishedCoverage([...others, puzzle]));
  return issues;
}

/** Every type needs a published puzzle, or buildSchedule cannot draw a match. */
export function checkPublishedCoverage(pool: Puzzle[]): Issue[] {
  return ROUND_ORDER.filter((type) => !pool.some((p) => p.type === type && p.status === "published")).map(
    (type) => ({ path: "status", message: `this would leave no published ${type} puzzle, so no match could start` }),
  );
}

/** Next free id for a type, e.g. "career_011". */
export function nextId(type: PuzzleType, taken: Iterable<string>): string {
  const prefix = `${ID_PREFIX[type]}_`;
  let max = 0;
  for (const id of taken) {
    const n = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : NaN;
    if (Number.isInteger(n)) max = Math.max(max, n);
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/** Validates a whole pool as stored (used by the content tests). */
export function validatePool(pool: Puzzle[]): { id: string; issues: Issue[] }[] {
  const problems: { id: string; issues: Issue[] }[] = [];
  pool.forEach((p, i) => {
    const result = validatePuzzle(p);
    const issues = result.ok ? checkAgainstPool(result.puzzle, pool.slice(0, i)).filter((x) => x.path !== "status") : result.issues;
    if (issues.length > 0) problems.push({ id: p.id, issues });
  });
  problems.push(...checkPublishedCoverage(pool).map((issue) => ({ id: "(pool)", issues: [issue] })));
  return problems;
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

export interface ImportItem {
  /** Position in the pasted array, from 1. */
  index: number;
  type?: string;
  id?: string;
  label: string;
  puzzle?: Puzzle;
  issues: Issue[];
}

export type ImportResult = { ok: true; items: ImportItem[] } | { ok: false; error: string };

/** Parses pasted JSON (an array of puzzles, or a single puzzle) and validates it. */
export function parseImport(text: string, pool: Puzzle[]): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(stripCodeFence(text));
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
  }
  if (typeof data === "object" && data !== null && !Array.isArray(data) && Array.isArray((data as Obj).puzzles)) {
    data = (data as Obj).puzzles;
  }
  const list = Array.isArray(data) ? data : [data];
  if (list.length === 0) return { ok: false, error: "The array is empty." };
  return { ok: true, items: validateBatch(list, pool) };
}

/** AI tools often wrap JSON in a ```json fence; accept that. */
function stripCodeFence(text: string): string {
  const fenced = text.trim().match(/^```[a-z]*\s*\n([\s\S]*?)\n?```$/i);
  return fenced ? fenced[1] : text;
}

/**
 * Validates each record, fills in missing ids, and checks each against the pool
 * plus the records before it in the batch (so a batch cannot repeat itself).
 * Imported puzzles always arrive as drafts, whatever their "status" says: bulk
 * content (often AI-written) is reviewed and published in /admin before any match
 * can draw it.
 */
export function validateBatch(list: unknown[], pool: Puzzle[]): ImportItem[] {
  const accepted: Puzzle[] = [];
  const taken = new Set(pool.map((p) => p.id));
  return list.map((raw, i) => {
    const o = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Obj) : undefined;
    const type = typeof o?.type === "string" ? o.type : undefined;
    let input = raw;
    if (o && o.id === undefined && type && (ROUND_ORDER as string[]).includes(type)) {
      input = { ...o, id: nextId(type as PuzzleType, taken) };
    }
    const result = validatePuzzle(input);
    const item: ImportItem = {
      index: i + 1,
      type,
      id: typeof (input as Obj | undefined)?.id === "string" ? ((input as Obj).id as string) : undefined,
      label: typeof o?.correct_answer === "string" ? o.correct_answer : "(no answer)",
      issues: result.ok ? [] : result.issues,
    };
    if (result.ok) {
      const clashes = checkAgainstPool(result.puzzle, [...pool, ...accepted]).filter((x) => x.path !== "status");
      if (clashes.length > 0) item.issues = clashes;
      else {
        item.puzzle = { ...result.puzzle, status: "draft" };
        accepted.push(item.puzzle);
      }
    }
    if (item.id) taken.add(item.id);
    return item;
  });
}
