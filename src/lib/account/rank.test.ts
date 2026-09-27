import { describe, expect, it } from "vitest";
import { RANK_TIERS, START_RATING, tierIndex, tierOf } from "./rank";

describe("rank tiers (§14)", () => {
  it("go ROOKIE → SEMI-PRO → PRO → ELITE → WORLD CLASS → LEGEND → GOAT", () => {
    expect(RANK_TIERS.map((t) => t.name)).toEqual(["Rookie", "Semi-Pro", "Pro", "Elite", "World Class", "Legend", "GOAT"]);
  });

  it("have rising thresholds starting at 0", () => {
    expect(RANK_TIERS[0].from).toBe(0);
    for (let i = 1; i < RANK_TIERS.length; i++) expect(RANK_TIERS[i].from).toBeGreaterThan(RANK_TIERS[i - 1].from);
  });

  it.each([
    [0, "Rookie"],
    [999, "Rookie"],
    [1000, "Semi-Pro"],
    [1199, "Semi-Pro"],
    [1200, "Pro"],
    [1399, "Pro"],
    [1400, "Elite"],
    [1600, "World Class"],
    [1800, "Legend"],
    [1999, "Legend"],
    [2000, "GOAT"],
    [3500, "GOAT"],
  ])("puts %i in %s", (rating, tier) => {
    expect(tierOf(rating)).toBe(tier);
  });

  it("starts a new account in PRO at 1200", () => {
    expect(START_RATING).toBe(1200);
    expect(tierOf(START_RATING)).toBe("Pro");
  });

  it("orders tiers for rank up / rank down", () => {
    expect(tierIndex("Semi-Pro")).toBeGreaterThan(tierIndex("Rookie"));
    expect(tierIndex("GOAT")).toBe(RANK_TIERS.length - 1);
  });
});
