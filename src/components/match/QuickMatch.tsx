"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { findOpponent, pollOpponent, resumeMatch, stopSearching } from "@/app/match/actions";
import type { NameEntry } from "@/data/names";
import type { MatchView } from "@/server/match/view";
import { MatchScreen } from "./MatchScreen";

/** How often the searching screen asks the server (it also keeps the entry fresh for pairing). */
const POLL_MS = 1_500;
/** "Opponent found" stays up this long before the first round. */
const FOUND_MS = 1_400;

type Phase =
  | { kind: "searching" }
  | { kind: "found"; view: MatchView }
  | { kind: "playing"; view: MatchView }
  | { kind: "error" };

function Ball() {
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" aria-hidden>
      <circle cx="24" cy="24" r="21" fill="none" stroke="#3ED598" strokeWidth="3" />
      <path d="M24 14.5l7.6 5.5-2.9 8.9h-9.4l-2.9-8.9z" fill="#3ED598" />
      <path
        d="M24 14.5V5M31.6 20l8.8-3M28.7 28.9l5.4 7.6M19.3 28.9l-5.4 7.6M16.4 20l-8.8-3"
        stroke="#3ED598"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Searching() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
      <div className="relative grid h-40 w-40 place-items-center" aria-hidden>
        <span className="absolute inset-0 rounded-full border-2 border-accent/40 motion-safe:animate-ping" />
        <span className="absolute inset-5 rounded-full border border-border-subtle" />
        <div className="relative grid h-20 w-20 place-items-center rounded-[20px] border border-border-subtle bg-bg-surface shadow-[0_0_48px_-12px_rgba(62,213,152,0.45)] motion-safe:animate-pulse">
          <Ball />
        </div>
      </div>
      <h1 className="mt-8 font-display text-2xl font-bold">Finding an opponent…</h1>
      <p className="mt-2 font-display text-sm font-semibold tabular-nums text-text-secondary">
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      </p>
      <p className="mt-1 text-sm text-text-muted">Quick Match · 5 rounds</p>
    </>
  );
}

function Found({ name }: { name: string }) {
  return (
    <>
      <div className="grid h-20 w-20 place-items-center rounded-full border border-accent bg-accent/10 font-display text-3xl font-bold text-accent motion-safe:animate-pop">
        {name[0]?.toLocaleUpperCase("tr")}
      </div>
      <p className="mt-6 font-display text-xs font-semibold uppercase tracking-widest text-accent">Opponent found</p>
      <h1 className="mt-1 font-display text-3xl font-bold">{name}</h1>
      <p className="mt-2 text-sm text-text-secondary">Get ready…</p>
    </>
  );
}

/**
 * Quick Match (GDD §13.1): PLAY puts the player in the server's queue, this screen
 * polls until the server hands over a match (a real opponent, or after the search
 * window the engine's opponent under a nickname), shows who was found, then plays.
 */
export function QuickMatch({ names }: { names: NameEntry[] }) {
  const [phase, setPhase] = useState<Phase>({ kind: "searching" });
  /** Bumped to search again (a rematch offer nobody answered). */
  const [search, setSearch] = useState(0);
  // Stable, because the match screen's timers depend on them.
  const searchAgain = useCallback(() => {
    setPhase({ kind: "searching" });
    setSearch((n) => n + 1);
  }, []);
  const openMatch = useCallback((view: MatchView) => setPhase({ kind: "playing", view }), []);

  useEffect(() => {
    let cancelled = false;
    let entryId: string | null = null;
    let settled = false;

    (async () => {
      // A real-player match this browser is still in (a reload, a reopened tab): back into it (§28).
      if (search === 0) {
        const resumed = await resumeMatch();
        if (cancelled) return;
        if (resumed) {
          settled = true;
          setPhase({ kind: "playing", view: resumed });
          return;
        }
      }
      const joined = await findOpponent();
      entryId = joined.entryId;
      // Unmounted while joining (e.g. React re-running effects in development): leave.
      if (cancelled) return void stopSearching(joined.entryId);
      while (!cancelled) {
        const result = await pollOpponent(joined.entryId);
        if (cancelled) return;
        if (result.status === "found") {
          settled = true;
          setPhase({ kind: "found", view: result.view });
          return;
        }
        if (result.status === "gone") throw new Error("Queue entry was closed");
        await new Promise((r) => window.setTimeout(r, POLL_MS));
      }
    })().catch(() => !cancelled && setPhase({ kind: "error" }));

    return () => {
      cancelled = true;
      if (entryId && !settled) void stopSearching(entryId).catch(() => {});
    };
  }, [search]);

  useEffect(() => {
    if (phase.kind !== "found") return;
    const timer = window.setTimeout(() => setPhase({ kind: "playing", view: phase.view }), FOUND_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase.kind === "playing") {
    return (
      <MatchScreen
        key={phase.view.id}
        initialView={phase.view}
        names={names}
        onSearchAgain={searchAgain}
        onOpenMatch={openMatch}
      />
    );
  }

  return (
    <main className="flex flex-1 justify-center px-5">
      <div className="flex w-full max-w-[390px] flex-col items-center justify-center py-16 text-center" role="status" aria-live="polite">
        {phase.kind === "searching" && <Searching />}
        {phase.kind === "found" && <Found name={phase.view.opponentName} />}
        {phase.kind === "error" && (
          <>
            <h1 className="font-display text-2xl font-bold">Could not find a match</h1>
            <p className="mt-2 text-sm text-text-secondary">Check your connection and try again.</p>
          </>
        )}
        {phase.kind !== "found" && (
          <Link
            href="/"
            className="mt-10 rounded-2xl px-6 py-3 font-display text-sm font-semibold uppercase tracking-widest text-text-secondary transition-colors hover:text-text-primary"
          >
            {phase.kind === "error" ? "Back to menu" : "Cancel"}
          </Link>
        )}
      </div>
    </main>
  );
}
