import "server-only";
import { cookies } from "next/headers";

// An anonymous player id for Quick Match (GDD §13.1: no account needed): a random
// UUID in an httpOnly cookie, created on the first PLAY. It keeps a player from being
// paired with their own other tab and ties queue entries and matches to one browser.
// Only Server Functions may set cookies, so this is called from those.

export const SESSION_COOKIE = "fpb_player";
const ONE_YEAR_S = 365 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function playerSession(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  if (existing && UUID.test(existing)) return existing;
  const id = crypto.randomUUID();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_S,
  });
  return id;
}
