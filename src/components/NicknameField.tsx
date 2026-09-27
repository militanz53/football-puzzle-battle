"use client";

import { useEffect, useState, useTransition } from "react";
import { saveNickname } from "@/app/match/actions";
import { NICKNAME_MAX } from "@/lib/nickname";

/** The check mark shows this long after a save, then fades out. */
const SAVED_MS = 1_500;

/**
 * The main menu's optional nickname (§13.2): what a real opponent sees. Empty means
 * "keep what I have"; a player who never sets one plays as Player_1234. Styled after
 * the match screen's player avatars (§22): the name's first letter in a green ring.
 */
export function NicknameField({ current, example }: { current: string | null; example: string }) {
  const [value, setValue] = useState(current ?? "");
  const [saved, setSaved] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [, startSaving] = useTransition();

  useEffect(() => {
    if (!justSaved) return;
    const timer = window.setTimeout(() => setJustSaved(false), SAVED_MS);
    return () => window.clearTimeout(timer);
  }, [justSaved]);

  function save() {
    const name = value.trim();
    if (!name || name === saved) return setError(null);
    startSaving(async () => {
      const result = await saveNickname(name);
      if (result.ok) {
        setSaved(result.name);
        setValue(result.name);
        setError(null);
        setJustSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  // The avatar previews the name as typed, or the example while the box is empty.
  const letter = (value.trim() || example)[0]?.toLocaleUpperCase("tr");

  return (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label htmlFor="nickname" className="font-display text-[11px] font-semibold uppercase tracking-widest text-text-muted">
        Nickname
      </label>
      <div className="mt-2 flex items-center gap-3">
        <span
          aria-hidden
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border border-accent bg-accent/10 font-display text-sm font-bold text-accent transition-opacity ${
            value.trim() ? "opacity-100" : "opacity-60"
          }`}
        >
          {letter}
        </span>
        <div className="relative min-w-0 flex-1">
          <input
            id="nickname"
            name="nickname"
            value={value}
            maxLength={NICKNAME_MAX}
            autoComplete="nickname"
            spellCheck={false}
            placeholder={example}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "nickname-error" : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onBlur={save}
            // Underline only; on focus it turns accent and a 1px shadow thickens it
            // without moving the text.
            className={`h-11 w-full rounded-none border-0 border-b bg-transparent pr-8 font-display text-lg font-semibold text-text-primary outline-none transition-[border-color,box-shadow] duration-200 placeholder:font-semibold placeholder:text-text-muted-2 ${
              error
                ? "border-red-400 focus:shadow-[0_1px_0_0_var(--color-red-400)]"
                : "border-border-subtle focus:border-accent focus:shadow-[0_1px_0_0_var(--color-accent)]"
            }`}
          />
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className={`pointer-events-none absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2 text-accent transition-opacity ${
              justSaved ? "opacity-100 duration-150" : "opacity-0 duration-700"
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
      </div>
      {/* Screen readers hear the save; the check mark is only visual. */}
      <span role="status" className="sr-only">
        {justSaved ? "Nickname saved" : ""}
      </span>
      {error && (
        // Out of the flow, under the line: the menu does not jump when it appears.
        <p id="nickname-error" className="absolute left-[3.25rem] top-full mt-1.5 text-xs text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}
