"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/admin/login/actions";
import { buttonClass, inputClass } from "./ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null });

  return (
    <form action={action} className="mt-5 flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-text-secondary">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
          className={inputClass}
        />
      </label>
      {state.error && (
        <p id="login-error" role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${buttonClass.primary} h-11`}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
