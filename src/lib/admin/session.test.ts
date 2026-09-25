import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminPassword,
  AdminConfigError,
  createSessionToken,
  passwordMatches,
  safeNextPath,
  SESSION_MS,
  verifySessionToken,
} from "./session";

const PASSWORD = "correct-horse-battery-staple-42";
const NOW = Date.UTC(2026, 8, 25, 12);

afterEach(() => vi.unstubAllEnvs());

describe("adminPassword (fails closed)", () => {
  it("refuses to run the panel without ADMIN_PANEL_PASSWORD", () => {
    vi.stubEnv("ADMIN_PANEL_PASSWORD", "");
    expect(() => adminPassword()).toThrow(AdminConfigError);
    expect(() => adminPassword()).toThrow(/ADMIN_PANEL_PASSWORD is not set/);
  });

  it("refuses a short password", () => {
    vi.stubEnv("ADMIN_PANEL_PASSWORD", "hunter2");
    expect(() => adminPassword()).toThrow(/at least 16 characters/);
  });

  it("returns a proper one", () => {
    vi.stubEnv("ADMIN_PANEL_PASSWORD", PASSWORD);
    expect(adminPassword()).toBe(PASSWORD);
  });
});

describe("passwordMatches", () => {
  it("accepts the exact password only", async () => {
    expect(await passwordMatches(PASSWORD, PASSWORD)).toBe(true);
    for (const guess of ["", "correct-horse-battery-staple-4", `${PASSWORD} `, PASSWORD.toUpperCase()]) {
      expect(await passwordMatches(guess, PASSWORD)).toBe(false);
    }
  });
});

describe("session token", () => {
  it("is valid for 7 days, then expires", async () => {
    const token = await createSessionToken(PASSWORD, NOW);
    expect(await verifySessionToken(token, PASSWORD, NOW)).toBe(true);
    expect(await verifySessionToken(token, PASSWORD, NOW + SESSION_MS - 1000)).toBe(true);
    expect(await verifySessionToken(token, PASSWORD, NOW + SESSION_MS)).toBe(false);
  });

  it("stops working when the password changes", async () => {
    const token = await createSessionToken(PASSWORD, NOW);
    expect(await verifySessionToken(token, `${PASSWORD}-rotated`, NOW)).toBe(false);
  });

  it("rejects a tampered expiry or signature", async () => {
    const token = await createSessionToken(PASSWORD, NOW);
    const [expires, signature] = token.split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
    expect(await verifySessionToken(`${Number(expires) + 1000}.${signature}`, PASSWORD, NOW)).toBe(false);
    expect(await verifySessionToken(`${expires}.${flipped}`, PASSWORD, NOW)).toBe(false);
  });

  it("rejects a far-future expiry even if it were signed", async () => {
    const future = await createSessionToken(PASSWORD, NOW + 365 * 24 * 3600 * 1000);
    expect(await verifySessionToken(future, PASSWORD, NOW)).toBe(false);
  });

  it("rejects missing and malformed cookies", async () => {
    for (const junk of [undefined, "", "abc", "123", "123.", ".abc", "1.2.3", "9999999999999.%%%", "NaN.abc"]) {
      expect(await verifySessionToken(junk, PASSWORD, NOW), String(junk)).toBe(false);
    }
  });
});

describe("safeNextPath", () => {
  it("keeps panel paths", () => {
    for (const path of ["/admin", "/admin/import", "/admin/edit/goal_001", "/admin?status=draft"]) expect(safeNextPath(path)).toBe(path);
  });

  it("never leaves the panel or loops back to the login page", () => {
    for (const path of [
      "https://evil.example/admin",
      "//evil.example/admin",
      "/\\evil.example",
      "/admin\\..\\x",
      "/match",
      "/administrator",
      "/admin/login",
      "/admin/login?next=/admin",
      null,
      42,
    ]) {
      expect(safeNextPath(path), String(path)).toBe("/admin");
    }
  });
});
