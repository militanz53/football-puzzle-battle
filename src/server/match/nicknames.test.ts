import { describe, expect, it } from "vitest";
import { seeded } from "@/game/__fixtures__/seeded";
import { MAX_NICKNAME_LENGTH, randomNickname } from "./nicknames";

describe("randomNickname", () => {
  const rng = seeded(11);
  const names = Array.from({ length: 2000 }, () => randomNickname(rng));

  it("never says bot, in any case", () => {
    expect(names.filter((n) => /bot/i.test(n))).toEqual([]);
  });

  it("looks like a handle: 3-16 letters, digits, _ with no spaces", () => {
    for (const name of names) {
      expect(name.length).toBeGreaterThanOrEqual(3);
      expect(name.length).toBeLessThanOrEqual(MAX_NICKNAME_LENGTH);
      expect(name).toMatch(/^[\p{L}\p{N}_]+$/u);
    }
  });

  it("varies a lot, across every kind of name", () => {
    expect(new Set(names).size).toBeGreaterThan(1000);
    expect(names.some((n) => /^\p{Lu}\p{Ll}+_\d{2}$/u.test(n))).toBe(true); // Emre_34
    expect(names.some((n) => /^\p{L}+(19|20)\d{2}$/u.test(n))).toBe(true); // Can2004
    expect(names.some((n) => /\d+Fan$/.test(n))).toBe(true); // Messi10Fan
    expect(names.some((n) => /^\p{L}+$/u.test(n))).toBe(true); // FutbolKralı
  });

  it("is repeatable for a given random source", () => {
    expect(randomNickname(seeded(3))).toBe(randomNickname(seeded(3)));
  });
});
