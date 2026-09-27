"use client";

import { useActionState, useState } from "react";
import { type AuthFormState, createAccount, signInToAccount } from "@/app/account/actions";
import { PASSWORD_MIN, USERNAME_MAX } from "@/lib/account/rules";

const input =
  "h-12 w-full rounded-xl border border-border-subtle bg-bg-primary px-4 font-body text-base text-text-primary outline-none transition-colors placeholder:text-text-muted-2 focus:border-accent";
const label = "font-display text-[11px] font-semibold uppercase tracking-widest text-text-muted";

function Field({
  name,
  title,
  hint,
  ...props
}: { name: string; title: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={label}>{title}</span>
      <input id={name} name={name} className={input} {...props} />
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </label>
  );
}

const EMPTY: AuthFormState = { error: null, email: "", username: "" };

function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(createAccount, EMPTY);
  return (
    <form action={action} className="flex flex-col gap-4" aria-describedby={state.error ? "auth-error" : undefined}>
      <input type="hidden" name="next" value={next} />
      <Field
        name="username"
        title="Username"
        hint="Your permanent name in Ranked. Letters, numbers and _."
        autoComplete="username"
        spellCheck={false}
        maxLength={USERNAME_MAX}
        required
        defaultValue={state.username}
      />
      <Field name="email" title="Email" type="email" autoComplete="email" required defaultValue={state.email} />
      <Field name="password" title="Password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required hint={`At least ${PASSWORD_MIN} characters.`} />
      <Submit pending={pending} error={state.error}>
        {pending ? "Creating account…" : "Create account"}
      </Submit>
    </form>
  );
}

function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInToAccount, EMPTY);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field name="email" title="Email" type="email" autoComplete="email" required defaultValue={state.email} />
      <Field name="password" title="Password" type="password" autoComplete="current-password" required />
      <Submit pending={pending} error={state.error}>
        {pending ? "Signing in…" : "Sign in"}
      </Submit>
    </form>
  );
}

function Submit({ pending, error, children }: { pending: boolean; error: string | null; children: React.ReactNode }) {
  return (
    <>
      {error && (
        <p id="auth-error" role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 h-14 w-full rounded-2xl bg-accent font-display text-lg font-bold uppercase tracking-wider text-bg-primary shadow-[0_8px_32px_-8px_rgba(62,213,152,0.55)] transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-70"
      >
        {children}
      </button>
    </>
  );
}

/** Ranked's sign-up / sign-in card (§13.5, §22 card style). Quick Match needs no account. */
export function AuthPanel({ next, initialTab }: { next: string; initialTab: "signup" | "signin" }) {
  const [tab, setTab] = useState(initialTab);
  const tabClass = (active: boolean) =>
    `h-10 flex-1 rounded-xl font-display text-sm font-semibold uppercase tracking-wider transition-colors ${
      active ? "bg-bg-surface-alt text-text-primary" : "text-text-secondary hover:text-text-primary"
    }`;
  return (
    <section className="rounded-[20px] border border-border-subtle bg-bg-surface p-5">
      <div role="tablist" aria-label="Account" className="mb-5 flex gap-1 rounded-2xl border border-border-subtle bg-bg-primary p-1">
        <button type="button" role="tab" aria-selected={tab === "signup"} onClick={() => setTab("signup")} className={tabClass(tab === "signup")}>
          Create account
        </button>
        <button type="button" role="tab" aria-selected={tab === "signin"} onClick={() => setTab("signin")} className={tabClass(tab === "signin")}>
          Sign in
        </button>
      </div>
      {/* Keyed, so switching tabs starts the other form fresh. */}
      {tab === "signup" ? <SignUpForm key="signup" next={next} /> : <SignInForm key="signin" next={next} />}
    </section>
  );
}
