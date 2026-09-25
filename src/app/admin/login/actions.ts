"use server";

import { redirect } from "next/navigation";
import { endAdminSession, startAdminSession } from "@/lib/admin/auth";
import { adminPassword, AdminConfigError, LOGIN_PATH, passwordMatches, safeNextPath } from "@/lib/admin/session";

export type LoginState = { error: string | null };

/** Slows down guessing; the password is long and random, so this is a courtesy. */
const WRONG_PASSWORD_DELAY_MS = 600;

export async function login(_previous: LoginState, form: FormData): Promise<LoginState> {
  let password: string;
  try {
    password = adminPassword();
  } catch (e) {
    if (e instanceof AdminConfigError) return { error: e.message };
    throw e;
  }
  const input = form.get("password");
  if (typeof input !== "string" || !(await passwordMatches(input, password))) {
    await new Promise((r) => setTimeout(r, WRONG_PASSWORD_DELAY_MS));
    return { error: "Wrong password." };
  }
  await startAdminSession();
  redirect(safeNextPath(form.get("next")));
}

export async function logout(): Promise<void> {
  await endAdminSession();
  redirect(LOGIN_PATH);
}
