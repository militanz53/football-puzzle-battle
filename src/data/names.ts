import { isCorrectAnswer, normalizeAnswer } from "@/game/answer";
import type { Puzzle } from "@/game/types";
import PLAYER_NAMES from "./player-names.json";

// Answer autocomplete: pool answers plus a few hundred well-known players
// (player-names.json), so a suggestion never gives the answer away by being the
// only name that fits. Pure, so it runs in the browser and in tests.

export interface NameEntry {
  /** What the player sees and submits. */
  name: string;
  /** Normalized (§26.1) strings a query is matched against: the name and, for pool answers, its aliases. */
  keys: string[];
}

export const MIN_QUERY = 2;
export const MAX_SUGGESTIONS = 5;

/**
 * Pool answers first, with their aliases as extra keys ("cr7" finds Cristiano Ronaldo).
 * A list name that some puzzle would accept is dropped: only the pool's own spelling
 * is offered for that player, so picking a suggestion can never cost a round.
 */
export function buildNameIndex(pool: Puzzle[], extra: string[] = PLAYER_NAMES): NameEntry[] {
  const byName = new Map<string, NameEntry>();
  for (const p of pool) {
    const key = normalizeAnswer(p.correct_answer);
    const entry = byName.get(key) ?? { name: p.correct_answer, keys: [key] };
    for (const alias of p.answer_aliases) {
      const a = normalizeAnswer(alias);
      if (!entry.keys.includes(a)) entry.keys.push(a);
    }
    byName.set(key, entry);
  }
  for (const name of extra) {
    const key = normalizeAnswer(name);
    if (byName.has(key) || pool.some((p) => isCorrectAnswer(name, p))) continue;
    byName.set(key, { name, keys: [key] });
  }
  return [...byName.values()];
}

/**
 * Up to MAX_SUGGESTIONS names for what the player has typed. Ranked: the full name
 * starts with the query, then the surname does, then another word or an alias does.
 */
export function suggestNames(index: NameEntry[], input: string, limit = MAX_SUGGESTIONS): string[] {
  const q = normalizeAnswer(input);
  if (q.length < MIN_QUERY) return [];

  const ranked: { name: string; rank: number }[] = [];
  for (const entry of index) {
    const [own, ...aliases] = entry.keys;
    const words = own.split(" ");
    let rank = -1;
    if (own.startsWith(q)) rank = 0;
    else if (words.at(-1)!.startsWith(q)) rank = 1;
    else if (words.some((w) => w.startsWith(q))) rank = 2;
    else if (aliases.some((a) => a.startsWith(q) || a.split(" ").some((w) => w.startsWith(q)))) rank = 3;
    if (rank >= 0) ranked.push({ name: entry.name, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return ranked.slice(0, limit).map((r) => r.name);
}
