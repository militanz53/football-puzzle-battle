"use server";

import { redirect } from "next/navigation";
import { endAccountSession, signIn, signUp } from "@/lib/account/auth";
import { checkEmail, checkPassword, checkUsername, safeAccountNext } from "@/lib/account/rules";

// Sign up, sign in and sign out for Ranked (GDD §13.5). Quick Match needs none of this.

export type AuthFormState = { error: string | null; email: string; username: string };

/** Slows down password guessing a little. */
const FAILED_SIGN_IN_DELAY_MS = 600;

export async function createAccount(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  const kept = { email: String(form.get("email") ?? ""), username: String(form.get("username") ?? "") };
  const username = checkUsername(form.get("username"));
  if (!username.ok) return { ...kept, error: username.error };
  const email = checkEmail(form.get("email"));
  if (!email.ok) return { ...kept, error: email.error };
  const password = checkPassword(form.get("password"));
  if (!password.ok) return { ...kept, error: password.error };

  const result = await signUp(email.value, password.value, username.value);
  if (!result.ok) return { ...kept, error: result.error };
  redirect(safeAccountNext(form.get("next")));
}

export async function signInToAccount(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  const kept = { email: String(form.get("email") ?? ""), username: "" };
  const email = checkEmail(form.get("email"));
  if (!email.ok) return { ...kept, error: email.error };
  const password = form.get("password");
  if (typeof password !== "string" || !password) return { ...kept, error: "Enter your password." };

  const result = await signIn(email.value, password);
  if (!result.ok) {
    await new Promise((r) => setTimeout(r, FAILED_SIGN_IN_DELAY_MS));
    return { ...kept, error: result.error };
  }
  redirect(safeAccountNext(form.get("next")));
}

export async function signOutOfAccount(): Promise<void> {
  await endAccountSession();
  redirect("/");
}
