"use client";

import { useSyncExternalStore } from "react";
import { isMuted, isMutedOnServer, play, setMuted, subscribeMuted } from "./player";

/** Speaker icon button for the top-right corner (§22.4 ghost style, like the back button). */
export function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, isMutedOnServer);

  return (
    <button
      type="button"
      onClick={() => {
        setMuted(!muted);
        if (muted) play("reveal"); // turning sound on: a soft pop confirms it
      }}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      aria-pressed={muted}
      title={muted ? "Sound off" : "Sound on"}
      className="grid h-9 w-9 place-items-center rounded-full text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor" />
        {muted ? (
          <path d="M16 9l5 6M21 9l-5 6" />
        ) : (
          <path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
        )}
      </svg>
    </button>
  );
}
