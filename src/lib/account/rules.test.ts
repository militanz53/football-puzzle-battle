import { describe, expect, it } from "vitest";
import { checkEmail, checkPassword, checkUsername, safeAccountNext } from "./rules";

describe("account rules", () => {
  it("accepts a username like a nickname, trimmed", () => {
    expect(checkUsername("  Kadir_10 ")).toEqual({ ok: true, value: "Kadir_10" });
    expect(checkUsername("Şükrü")).toEqual({ ok: true, value: "Şükrü" });
  });

  it.each([["ab"], ["a".repeat(17)], ["has space"], ["dash-ed"], [""], [42]])("refuses the username %j", (input) => {
    expect(checkUsername(input).ok).toBe(false);
  });

  it("normalises the email and refuses obvious typos", () => {
    expect(checkEmail(" Kadir@Example.COM ")).toEqual({ ok: true, value: "kadir@example.com" });
    expect(checkEmail("kadir@example").ok).toBe(false);
    expect(checkEmail("kadir example.com").ok).toBe(false);
    expect(checkEmail(undefined).ok).toBe(false);
  });

  it("wants a password of 8 to 72 bytes, kept exactly as typed", () => {
    expect(checkPassword("short")).toMatchObject({ ok: false });
    expect(checkPassword(" 8 chars ")).toEqual({ ok: true, value: " 8 chars " });
    expect(checkPassword("x".repeat(73))).toMatchObject({ ok: false });
    expect(checkPassword("ğ".repeat(37))).toMatchObject({ ok: false }); // 74 bytes
  });

  it("only sends a signed-in player back to the menu or Ranked", () => {
    expect(safeAccountNext("/ranked")).toBe("/ranked");
    expect(safeAccountNext("/friends")).toBe("/friends");
    expect(safeAccountNext("/leaderboard")).toBe("/leaderboard");
    for (const next of ["/", "//evil.example", "https://evil.example", "/admin", null]) expect(safeAccountNext(next)).toBe("/");
  });
});
