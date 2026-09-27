// What a ranked account needs (GDD §13.5): an email and password for signing in, and a
// permanent username, separate from Quick Match's throwaway nickname (§13.2) but with
// the same shape. Pure, so the forms, the server and tests share it.

import { NICKNAME_MAX, NICKNAME_MIN } from "@/lib/nickname";

export const USERNAME_MIN = NICKNAME_MIN;
export const USERNAME_MAX = NICKNAME_MAX;
export const PASSWORD_MIN = 8;
/** bcrypt, which Supabase Auth uses, reads only the first 72 bytes. */
export const PASSWORD_MAX = 72;

const USERNAME = /^[\p{L}\p{N}_]+$/u;
// Deliberately loose: Supabase Auth checks the address too; this only catches typos.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

export function checkUsername(input: unknown): Check<string> {
  if (typeof input !== "string") return { ok: false, error: "Enter a username." };
  const name = input.trim();
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
    return { ok: false, error: `Username: use ${USERNAME_MIN}-${USERNAME_MAX} characters.` };
  }
  if (!USERNAME.test(name)) return { ok: false, error: "Username: letters, numbers and _ only." };
  return { ok: true, value: name };
}

export function checkEmail(input: unknown): Check<string> {
  if (typeof input !== "string") return { ok: false, error: "Enter your email." };
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: "Enter a valid email address." };
  return { ok: true, value: email };
}

export function checkPassword(input: unknown): Check<string> {
  if (typeof input !== "string" || input.length === 0) return { ok: false, error: "Enter a password." };
  if (input.length < PASSWORD_MIN) return { ok: false, error: `Password: at least ${PASSWORD_MIN} characters.` };
  if (new TextEncoder().encode(input).length > PASSWORD_MAX) return { ok: false, error: "Password: too long." };
  return { ok: true, value: input };
}

/** Where to go after signing in: only our own account pages, never another site. */
export function safeAccountNext(next: unknown): "/" | "/ranked" | "/friends" {
  return next === "/ranked" || next === "/friends" ? next : "/";
}
