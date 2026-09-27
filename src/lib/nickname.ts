import type { Rng } from "@/game/bot";

// Player nicknames (GDD §13.2: "nickname seçer"; no accounts yet, §29). A player may
// pick one on the main menu; without one they are "Player_" and four digits. The name
// lives in the anonymous session cookie with the session id (src/lib/session.ts), and
// a real opponent sees it. Pure, so it is shared by the server and tests.

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 16;
const ALLOWED = /^[\p{L}\p{N}_]+$/u;

export type NicknameCheck = { ok: true; name: string } | { ok: false; error: string };

export function checkNickname(input: unknown): NicknameCheck {
  if (typeof input !== "string") return { ok: false, error: "Enter a nickname." };
  const name = input.trim();
  if (name.length < NICKNAME_MIN || name.length > NICKNAME_MAX) {
    return { ok: false, error: `Use ${NICKNAME_MIN}-${NICKNAME_MAX} characters.` };
  }
  if (!ALLOWED.test(name)) return { ok: false, error: "Letters, numbers and _ only." };
  return { ok: true, name };
}

/** The name for a player who did not pick one: Player_ and four digits. */
export function randomPlayerName(rng: Rng): string {
  return `Player_${String(Math.floor(rng() * 10_000)).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// The session cookie: "<uuid>" or "<uuid>~<nickname, URI-encoded>"
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Identity {
  id: string;
  name: string | null;
}

export function encodeIdentity({ id, name }: Identity): string {
  return name ? `${id}~${encodeURIComponent(name)}` : id;
}

/** Null for a missing or tampered cookie; a bad name is dropped, the id kept. */
export function decodeIdentity(value: string | undefined): Identity | null {
  if (!value) return null;
  const [id, encoded] = value.split("~", 2);
  if (!UUID.test(id)) return null;
  if (encoded === undefined) return { id, name: null };
  let decoded: string;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    return { id, name: null };
  }
  const check = checkNickname(decoded);
  return { id, name: check.ok ? check.name : null };
}
