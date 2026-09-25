// Shared-password login for /admin: no user accounts, one password in the
// ADMIN_PANEL_PASSWORD environment variable, known only to the project owner.
//
// A signed-in browser holds an httpOnly cookie "<expiry>.<signature>", where the
// signature is an HMAC of the expiry keyed by the password. Nothing is stored on
// the server, and changing the password signs every browser out.
//
// Web Crypto only (no node: imports), so the same code runs in src/proxy.ts and in
// Server Components / Server Functions.

export const ADMIN_COOKIE = "fpb_admin";
/** The cookie is only sent to the panel's own URLs (pages and their Server Functions). */
export const ADMIN_COOKIE_PATH = "/admin";
export const SESSION_DAYS = 7;
export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 16;

export class AdminConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminConfigError";
  }
}

/**
 * The configured password. Missing or short is an error rather than an open panel:
 * a deploy without ADMIN_PANEL_PASSWORD must fail closed.
 */
export function adminPassword(): string {
  const password = process.env.ADMIN_PANEL_PASSWORD;
  if (!password) {
    throw new AdminConfigError("ADMIN_PANEL_PASSWORD is not set, so the admin panel is disabled. See README.md.");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AdminConfigError(`ADMIN_PANEL_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return password;
}

const encoder = new TextEncoder();

function hmacKey(secret: string, purpose: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(`fpb-admin:${purpose}:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Constant-time: `verify` recomputes the HMAC of the guess and compares digests,
 * so the response time says nothing about how much of a guess was right.
 */
export async function passwordMatches(input: string, password: string): Promise<boolean> {
  if (!input) return false;
  const key = await hmacKey(password, "password");
  const expected = await crypto.subtle.sign("HMAC", key, encoder.encode(password));
  return crypto.subtle.verify("HMAC", key, expected, encoder.encode(input));
}

/** A cookie value valid for SESSION_DAYS from `now`. */
export async function createSessionToken(password: string, now = Date.now()): Promise<string> {
  const expires = String(now + SESSION_MS);
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(password, "session"), encoder.encode(expires));
  return `${expires}.${toBase64Url(signature)}`;
}

/** True only for an unexpired token signed with this password. */
export async function verifySessionToken(token: string | undefined, password: string, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [expires, signature, extra] = token.split(".");
  if (extra !== undefined || !/^\d{1,15}$/.test(expires ?? "")) return false;
  const expiresAt = Number(expires);
  // Expired, or further out than we ever issue (a forged far-future expiry).
  if (expiresAt <= now || expiresAt > now + SESSION_MS + 60_000) return false;
  const bytes = fromBase64Url(signature ?? "");
  if (!bytes) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(password, "session"), bytes, encoder.encode(expires));
}

export const LOGIN_PATH = "/admin/login";

/**
 * Where to go after signing in: a panel path only, so ?next= cannot send the
 * browser to another site ("//evil.example", "https://…") or back to the login page.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || next.includes("\\") || next.startsWith("//")) return "/admin";
  if (!/^\/admin(\/|\?|$)/.test(next) || next === LOGIN_PATH || next.startsWith(`${LOGIN_PATH}?`)) return "/admin";
  return next;
}
