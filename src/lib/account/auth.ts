import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicSupabaseConfig, secretSupabaseKey } from "@/lib/supabase/env";
import { getServerSupabase } from "@/lib/supabase/server";
import { getProfile, insertProfile, type Profile, usernameTaken } from "./profiles";
import { ACCOUNT_COOKIE, ACCOUNT_SESSION_MS, createAccountToken, verifyAccountToken } from "./token";

// Ranked accounts (GDD §13.5) on Supabase Auth, email + password. Everything happens
// on the server: Supabase Auth stores and checks the password, and the browser only
// ever holds our signed httpOnly cookie (./token.ts). Quick Match's anonymous session
// (src/lib/session.ts) is a separate cookie and is left alone.

/** The cookie is signed with a key derived from the secret key, which never leaves the server. */
const signingSecret = () => secretSupabaseKey();

/** The signed-in account's id from the cookie, without a database read. */
export async function currentAccountId(): Promise<string | null> {
  return verifyAccountToken((await cookies()).get(ACCOUNT_COOKIE)?.value, signingSecret());
}

/** The signed-in account's profile, or null (not signed in, expired, or deleted since). */
export async function currentAccount(): Promise<Profile | null> {
  const userId = await currentAccountId();
  return userId ? getProfile(userId, getServerSupabase()) : null;
}

async function startAccountSession(userId: string): Promise<void> {
  (await cookies()).set(ACCOUNT_COOKIE, await createAccountToken(userId, signingSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCOUNT_SESSION_MS / 1000,
  });
}

export async function endAccountSession(): Promise<void> {
  (await cookies()).delete({ name: ACCOUNT_COOKIE, path: "/" });
}

export type AuthResult = { ok: true } | { ok: false; error: string };

/**
 * A new account: the Auth user (confirmed at once; the MVP sends no emails), then its
 * profile. If the profile cannot be made (the username was taken a moment ago), the
 * user is removed again so the email can be used for another try.
 */
export async function signUp(email: string, password: string, username: string): Promise<AuthResult> {
  const admin = getServerSupabase();
  if (await usernameTaken(username, admin)) return { ok: false, error: "That username is taken." };

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    if (error?.code === "email_exists" || /already been registered/i.test(error?.message ?? "")) {
      return { ok: false, error: "An account with this email already exists. Sign in instead." };
    }
    if (error?.code === "weak_password") return { ok: false, error: "That password is too weak. Try a longer one." };
    throw new Error(`Could not create the account: ${error?.message ?? "no user returned"}`);
  }

  if (!(await insertProfile(data.user.id, username, admin))) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: "That username is taken." };
  }
  await startAccountSession(data.user.id);
  return { ok: true };
}

/** Checks the password with Supabase Auth, then starts our own session. */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  // A throwaway client: the sign-in must not stick to the shared publishable-key
  // client, where it would turn the game's reads into this user's.
  const { url, publishableKey } = publicSupabaseConfig();
  const auth = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).auth;
  const { data, error } = await auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error && (error.code === "invalid_credentials" || error.status === 400)) {
      return { ok: false, error: "Wrong email or password." };
    }
    throw new Error(`Could not sign in: ${error?.message ?? "no user returned"}`);
  }
  if (!(await getProfile(data.user.id, getServerSupabase()))) {
    return { ok: false, error: "This account has no player profile. Create an account first." };
  }
  await startAccountSession(data.user.id);
  return { ok: true };
}
