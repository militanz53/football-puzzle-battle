import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadSnapshot, SNAPSHOT_FILE } from "@/test/snapshot";
import { formatPuzzlesJson } from "./format";

// src/data/puzzles.json is written by `npm run db:export`. These checks keep a
// re-export of unchanged data from producing any diff.

const SNAPSHOT = loadSnapshot();

/** What Postgres jsonb does to object keys: shortest first, then alphabetical. */
function jsonbKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonbKeyOrder);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1))
      .map(([k, v]) => [k, jsonbKeyOrder(v)]),
  );
}

describe("puzzles.json format", () => {
  it("reproduces the committed file byte for byte", () => {
    expect(formatPuzzlesJson(SNAPSHOT)).toBe(readFileSync(SNAPSHOT_FILE, "utf8").replace(/\r\n/g, "\n"));
  });

  it("does not depend on the key order the database returns", () => {
    const fromDatabase = SNAPSHOT.map((p) => ({ ...p, reveal_data: jsonbKeyOrder(p.reveal_data) }));
    expect(JSON.stringify(fromDatabase[0].reveal_data)).not.toBe(JSON.stringify(SNAPSHOT[0].reveal_data));
    expect(formatPuzzlesJson(fromDatabase as typeof SNAPSHOT)).toBe(formatPuzzlesJson(SNAPSHOT));
  });

  it("does not depend on the order rows arrive in", () => {
    expect(formatPuzzlesJson([...SNAPSHOT].reverse())).toBe(formatPuzzlesJson(SNAPSHOT));
  });

  it("parses back to the same records", () => {
    expect(JSON.parse(formatPuzzlesJson(SNAPSHOT))).toEqual(SNAPSHOT);
  });
});
