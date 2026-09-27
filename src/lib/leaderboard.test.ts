import { describe, expect, it } from "vitest";
import { fakeDatabase, fakeTable } from "@/test/fakeSupabase";
import { leaderboardEntry, leaderboardPage, topPlayers, type LeaderboardEntry } from "./leaderboard";

const entry = (position: number, username: string, rating: number): LeaderboardEntry => ({
  position,
  username,
  rating,
  tier: rating >= 1400 ? "Elite" : "Pro",
  matchesPlayed: 3,
  matchesWon: 2,
});

describe("reading the leaderboard", () => {
  // Rows as the view returns them, plus columns that must never reach the page even
  // if a future view carried them by mistake.
  const view = fakeTable([
    { position: 1, username: "Deniz", rating: 1510, matches_played: 9, matches_won: 7, matches_lost: 2, user_id: "u-1", email: "deniz@example.com" },
    { position: 2, username: "Kadir", rating: 1407, matches_played: 4, matches_won: 3, matches_lost: 1, user_id: "u-2", email: "kadir@example.com" },
  ]);
  const db = fakeDatabase({ leaderboard: view });

  it("keeps only the public fields, with the tier worked out from the rating", async () => {
    const top = await topPlayers(100, db);
    expect(top).toEqual([
      { position: 1, username: "Deniz", rating: 1510, tier: "Elite", matchesPlayed: 9, matchesWon: 7 },
      { position: 2, username: "Kadir", rating: 1407, tier: "Elite", matchesPlayed: 4, matchesWon: 3 },
    ]);
    expect(JSON.stringify(top)).not.toMatch(/user_id|u-1|email|@example/);
  });

  it("reads from the public view, never from profiles", async () => {
    // fakeDatabase throws for a table it does not have: only "leaderboard" exists here.
    await expect(topPlayers(100, db)).resolves.toHaveLength(2);
    expect(await leaderboardEntry("Kadir", db)).toMatchObject({ position: 2, rating: 1407 });
    expect(await leaderboardEntry("Nobody", db)).toBeNull();
  });
});

describe("marking your own line", () => {
  const top = [entry(1, "Deniz", 1510), entry(2, "Kadir", 1407), entry(3, "Ece", 1300)];

  it("marks your line in the list, and no other", () => {
    const page = leaderboardPage(top, entry(2, "Kadir", 1407));
    expect(page.entries.map((e) => [e.username, e.you])).toEqual([
      ["Deniz", false],
      ["Kadir", true],
      ["Ece", false],
    ]);
    expect(page.youBelow).toBe(false);
  });

  it("shows your line separately when you are further down", () => {
    const page = leaderboardPage(top, entry(342, "Mert", 1011));
    expect(page.entries.every((e) => !e.you)).toBe(true);
    expect(page.youBelow).toBe(true);
    expect(page.you?.position).toBe(342);
  });

  it("marks nothing when signed out or not ranked yet", () => {
    const page = leaderboardPage(top, null);
    expect(page.entries.some((e) => e.you)).toBe(false);
    expect(page).toMatchObject({ you: null, youBelow: false });
  });
});
