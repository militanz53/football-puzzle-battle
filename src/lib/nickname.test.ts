import { describe, expect, it } from "vitest";
import { seeded } from "@/game/__fixtures__/seeded";
import { checkNickname, decodeIdentity, encodeIdentity, randomPlayerName } from "./nickname";

const ID = "3f2c8a2e-1b4d-4c6e-9a7b-0d1e2f3a4b5c";

describe("checkNickname", () => {
  it("accepts 3-16 letters, digits and _ (Turkish letters too), trimmed", () => {
    expect(checkNickname("  Emre_34 ")).toEqual({ ok: true, name: "Emre_34" });
    expect(checkNickname("GolcüRuhu")).toEqual({ ok: true, name: "GolcüRuhu" });
  });

  it("explains what is wrong", () => {
    expect(checkNickname("ab")).toEqual({ ok: false, error: "Use 3-16 characters." });
    expect(checkNickname("a".repeat(17))).toMatchObject({ ok: false });
    expect(checkNickname("Emre 34")).toEqual({ ok: false, error: "Letters, numbers and _ only." });
    expect(checkNickname("<script>")).toMatchObject({ ok: false });
    expect(checkNickname(42)).toMatchObject({ ok: false });
  });
});

describe("randomPlayerName", () => {
  it("is Player_ and four digits, and a valid nickname", () => {
    const rng = seeded(1);
    for (let i = 0; i < 200; i++) {
      const name = randomPlayerName(rng);
      expect(name).toMatch(/^Player_\d{4}$/);
      expect(checkNickname(name).ok).toBe(true);
    }
  });
});

describe("the session cookie", () => {
  it("round-trips the id and the name, including non-ASCII names", () => {
    for (const name of [null, "Emre_34", "GolcüRuhu"]) {
      expect(decodeIdentity(encodeIdentity({ id: ID, name }))).toEqual({ id: ID, name });
    }
  });

  it("reads an old cookie that holds only the id", () => {
    expect(decodeIdentity(ID)).toEqual({ id: ID, name: null });
  });

  it("drops a tampered name but keeps the id; rejects a bad id", () => {
    expect(decodeIdentity(`${ID}~${encodeURIComponent("<b>hi</b>")}`)).toEqual({ id: ID, name: null });
    expect(decodeIdentity(`${ID}~%E0%A4%A`)).toEqual({ id: ID, name: null });
    expect(decodeIdentity("not-a-uuid~Emre")).toBeNull();
    expect(decodeIdentity(undefined)).toBeNull();
  });
});
