"use client";

import { useState, useTransition } from "react";
import { saveNickname } from "@/app/match/actions";
import { NICKNAME_MAX } from "@/lib/nickname";

/**
 * The main menu's optional nickname (§13.2): what a real opponent sees. Empty means
 * "keep what I have"; a player who never sets one plays as Player_1234.
 */
export function NicknameField({ current }: { current: string | null }) {
  const [value, setValue] = useState(current ?? "");
  const [saved, setSaved] = useState(current);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startSaving] = useTransition();

  function save() {
    const name = value.trim();
    if (!name || name === saved) return setMessage(null);
    startSaving(async () => {
      const result = await saveNickname(name);
      if (result.ok) {
        setSaved(result.name);
        setValue(result.name);
        setMessage({ text: "Saved", error: false });
      } else {
        setMessage({ text: result.error, error: true });
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label htmlFor="nickname" className="font-display text-[11px] font-semibold uppercase tracking-widest text-text-muted">
        Nickname
      </label>
      <input
        id="nickname"
        name="nickname"
        value={value}
        maxLength={NICKNAME_MAX}
        autoComplete="nickname"
        spellCheck={false}
        placeholder="Optional · a random name if empty"
        aria-invalid={message?.error || undefined}
        aria-describedby="nickname-message"
        onChange={(e) => {
          setValue(e.target.value);
          setMessage(null);
        }}
        onBlur={save}
        className="h-12 w-full rounded-2xl border border-border-subtle bg-bg-surface px-4 text-base font-semibold text-text-primary placeholder:font-normal placeholder:text-text-muted-2 focus:border-accent focus:outline-none"
      />
      <p id="nickname-message" role="status" className={`min-h-4 text-xs ${message?.error ? "text-red-300" : "text-text-muted"}`}>
        {pending ? "Saving…" : message?.text}
      </p>
    </form>
  );
}
