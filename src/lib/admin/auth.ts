import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_PATH,
  adminPassword,
  createSessionToken,
  LOGIN_PATH,
  SESSION_MS,
  verifySessionToken,
} from "./session";

// The real admin check, run by every panel page and every admin Server Function
// (src/proxy.ts only pre-filters requests to /admin URLs; Server Functions can be
// posted to any URL, so they must check for themselves).

export async function isAdminSignedIn(): Promise<boolean> {
  const password = adminPassword(); // throws when unset: the panel fails closed
  return verifySessionToken((await cookies()).get(ADMIN_COOKIE)?.value, password);
}

/** Sends a browser that is not signed in to the login page. Call it before anything else. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdminSignedIn())) redirect(LOGIN_PATH);
}

export async function startAdminSession(): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, await createSessionToken(adminPassword()), {
    httpOnly: true, // not readable by page scripts
    secure: process.env.NODE_ENV === "production", // https only once deployed
    sameSite: "lax",
    path: ADMIN_COOKIE_PATH,
    maxAge: SESSION_MS / 1000, // survives closing the browser, for SESSION_DAYS
  });
}

export async function endAdminSession(): Promise<void> {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: ADMIN_COOKIE_PATH });
}
