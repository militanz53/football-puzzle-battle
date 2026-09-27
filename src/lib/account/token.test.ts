import { describe, expect, it } from "vitest";
import { ACCOUNT_SESSION_MS, createAccountToken, verifyAccountToken } from "./token";

const SECRET = "sb_secret_for_tests_only";
const USER = "0b6f3c1e-8d2a-4f5b-9c7d-1e2f3a4b5c6d";
const T0 = 1_750_000_000_000;

describe("account session cookie", () => {
  it("round-trips the user id", async () => {
    const token = await createAccountToken(USER, SECRET, T0);
    expect(await verifyAccountToken(token, SECRET, T0 + 1000)).toBe(USER);
  });

  it("expires after 30 days", async () => {
    const token = await createAccountToken(USER, SECRET, T0);
    expect(await verifyAccountToken(token, SECRET, T0 + ACCOUNT_SESSION_MS - 1)).toBe(USER);
    expect(await verifyAccountToken(token, SECRET, T0 + ACCOUNT_SESSION_MS)).toBeNull();
  });

  it("is refused under another secret", async () => {
    const token = await createAccountToken(USER, SECRET, T0);
    expect(await verifyAccountToken(token, "another_secret", T0)).toBeNull();
  });

  it("cannot be moved to another user or given a later expiry", async () => {
    const token = await createAccountToken(USER, SECRET, T0);
    const [, expires, signature] = token.split(".");
    const other = "11111111-2222-4333-8444-555555555555";
    expect(await verifyAccountToken(`${other}.${expires}.${signature}`, SECRET, T0)).toBeNull();
    expect(await verifyAccountToken(`${USER}.${Number(expires) + 1}.${signature}`, SECRET, T0)).toBeNull();
  });

  it.each([[undefined], [""], ["garbage"], [`${USER}.123`], [`${USER}.999999999999999.abc.extra`]])("refuses %j", async (token) => {
    expect(await verifyAccountToken(token, SECRET, T0)).toBeNull();
  });
});
