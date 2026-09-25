import { describe, expect, it } from "vitest";
import { loadSnapshot } from "@/test/snapshot";
import { validatePuzzle } from "@/data/schema";
import { ROUND_ORDER } from "@/game/match";
import { draftFromPuzzle, draftToRecord, emptyDraft } from "./draft";

describe("admin form draft", () => {
  it.each(loadSnapshot().map((p) => [p.id, p] as const))("round-trips %s through the form unchanged", (_id, p) => {
    expect(validatePuzzle(draftToRecord(draftFromPuzzle(p)))).toEqual({ ok: true, puzzle: p });
  });

  it.each(ROUND_ORDER)("starts a blank %s that the validator explains instead of crashing on", (type) => {
    const r = validatePuzzle(draftToRecord(emptyDraft(type, "new_001")));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues.map((i) => i.path)).toContain("correct_answer");
  });

  it("passes a mistyped Goal Map point to the validator with its line", () => {
    const d = emptyDraft("goal_map", "goal_900");
    d.goal.attackers = "10, 20\n12, abc";
    const r = validatePuzzle(draftToRecord(d));
    expect(!r.ok && r.issues.map((i) => i.path)).toContain("reveal_data.attackers[1]");
  });
});
