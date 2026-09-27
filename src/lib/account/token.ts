// The signed-in account's cookie: "<user id>.<expiry>.<signature>", where the signature
// is an HMAC of the id and expiry keyed by a server secret. Supabase Auth checks the
// password once, at sign-in; after that this cookie is the session, so no request
// needs a round trip to Supabase Auth or a token refresh. Signing out deletes it.
// Web Crypto only, like the admin session (src/lib/admin/session.ts).

export const ACCOUNT_COOKIE = "fpb_account";
export const ACCOUNT_SESSION_DAYS = 30;
export const ACCOUNT_SESSION_MS = ACCOUNT_SESSION_DAYS * 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(`fpb-account:session:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, [
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

/** A cookie value for `userId`, valid for ACCOUNT_SESSION_DAYS from `now`. */
export async function createAccountToken(userId: string, secret: string, now = Date.now()): Promise<string> {
  if (!UUID.test(userId)) throw new Error("Invalid user id");
  const payload = `${userId.toLowerCase()}.${now + ACCOUNT_SESSION_MS}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

/** The user id in an unexpired token signed with `secret`, or null. */
export async function verifyAccountToken(token: string | undefined, secret: string, now = Date.now()): Promise<string | null> {
  if (!token) return null;
  const [userId, expires, signature, extra] = token.split(".");
  if (extra !== undefined || !UUID.test(userId ?? "") || !/^\d{1,15}$/.test(expires ?? "")) return null;
  const expiresAt = Number(expires);
  // Expired, or further out than we ever issue (a forged far-future expiry).
  if (expiresAt <= now || expiresAt > now + ACCOUNT_SESSION_MS + 60_000) return null;
  const bytes = fromBase64Url(signature ?? "");
  if (!bytes) return null;
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), bytes, encoder.encode(`${userId}.${expires}`));
  return valid ? userId! : null;
}
