"use client";

import { useState } from "react";
import { NicknameField } from "@/components/NicknameField";

/** A frosted card over the stadium photo (§22 card, see-through). */
export const glassCard =
  "rounded-[20px] border border-white/10 bg-bg-surface/55 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md";

/** The avatar ring of the match screen (Scoreboard), for the menu. */
function Avatar({ letter, rival = false }: { letter: string; rival?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-12 w-12 place-items-center rounded-full border font-display text-base font-bold ${
        rival ? "border-border-subtle bg-bg-surface-alt/70 text-text-muted" : "border-accent bg-accent/10 text-accent"
      }`}
    >
      {letter}
    </span>
  );
}

/**
 * A look at what PLAY starts (§3, §13.1): you against a rival, five rounds. Static
 * apart from your avatar, which shows your nickname's first letter as you type it.
 */
function DuelPreview({ letter }: { letter: string }) {
  return (
    <section aria-label="Match preview" className={`${glassCard} px-5 pb-4 pt-4`}>
      <p className="text-center font-display text-xs font-bold uppercase tracking-[0.2em] text-accent">Head-to-head duel</p>
      <p className="mt-1 text-center font-display text-[11px] font-semibold uppercase tracking-widest text-text-muted">
        5 rounds · ~4-6 min
      </p>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex w-16 flex-col items-center gap-1.5">
          <Avatar letter={letter} />
          <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-text-secondary">You</span>
        </div>
        <span aria-label="Score 0 to 0" className="font-display text-3xl font-bold tabular-nums text-text-primary">
          0 <span className="text-text-muted-2">—</span> 0
        </span>
        <div className="flex w-16 flex-col items-center gap-1.5">
          <Avatar letter="?" rival />
          <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-text-secondary">Rival</span>
        </div>
      </div>
      <div className="mt-4 flex justify-center gap-2" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-text-muted-2" />
        ))}
      </div>
    </section>
  );
}

/** The menu's player part: the nickname card and the duel preview, sharing the name as typed. */
export function MenuLobby({ current, example }: { current: string | null; example: string }) {
  const [typed, setTyped] = useState(current ?? "");
  const letter = (typed.trim() || example)[0]?.toLocaleUpperCase("tr") ?? "?";
  return (
    <div className="flex flex-col gap-3">
      <div className={`${glassCard} px-5 pb-5 pt-4`}>
        <NicknameField current={current} example={example} onNameChange={setTyped} />
      </div>
      <DuelPreview letter={letter} />
    </div>
  );
}
