import "server-only";
import { cookies } from "next/headers";
import { decodeIdentity, encodeIdentity, type Identity, randomPlayerName } from "./nickname";

// The anonymous player (GDD §13.1: no account needed): a random UUID and, once
// chosen or given, a nickname, together in one httpOnly cookie. The id keeps a
// player from being paired with their own other tab and ties queue entries and
// matches to one browser; the nickname is what a real opponent sees. Only Server
// Functions may set cookies, so the setters are called from those.

export const SESSION_COOKIE = "fpb_player";
const ONE_YEAR_S = 365 * 24 * 60 * 60;

async function write(identity: Identity): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, encodeIdentity(identity), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_S,
  });
}

/** The player as the cookie says, without creating one (for rendering pages). */
export async function readIdentity(): Promise<Identity | null> {
  return decodeIdentity((await cookies()).get(SESSION_COOKIE)?.value);
}

/** The player, creating the anonymous id on first use. */
export async function playerIdentity(): Promise<Identity> {
  const existing = await readIdentity();
  if (existing) return existing;
  const identity = { id: crypto.randomUUID(), name: null };
  await write(identity);
  return identity;
}

export async function playerSession(): Promise<string> {
  return (await playerIdentity()).id;
}

/** Saves the nickname the player chose (already checked). */
export async function setPlayerName(name: string): Promise<void> {
  const { id } = await playerIdentity();
  await write({ id, name });
}

/** The player's nickname, giving them "Player_1234" if they never picked one. */
export async function ensurePlayerName(): Promise<string> {
  const identity = await playerIdentity();
  if (identity.name) return identity.name;
  const name = randomPlayerName(Math.random);
  await write({ id: identity.id, name });
  return name;
}
