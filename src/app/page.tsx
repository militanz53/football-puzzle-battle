// Main Menu — GDD §21 (first prototype: PLAY, PRACTICE, HOW TO PLAY) styled per §22.
// PLAY opens the 5-round match; PRACTICE and HOW TO PLAY are still inert.

import Link from "next/link";

function Logo() {
  return (
    <div className="relative flex flex-col items-center gap-5">
      {/* Centre circle framing the wordmark: a nod to "football pitches" (§3.3) */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-border-subtle opacity-60"
      />
      <div className="relative flex h-20 w-20 items-center justify-center rounded-[20px] border border-border-subtle bg-bg-surface shadow-[0_0_48px_-12px_rgba(62,213,152,0.45)]">
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
      </div>
      <h1 className="relative text-center font-display font-bold uppercase leading-[0.95] tracking-tight">
        <span className="block text-[2.75rem] text-text-primary">Football</span>
        <span className="block text-[2.75rem] text-text-primary">Puzzle</span>
        <span className="block text-[2.75rem] text-accent">Battle</span>
      </h1>
      <p className="relative max-w-[16rem] text-center text-[15px] leading-snug text-text-secondary">
        Know it before your opponent does.
      </p>
    </div>
  );
}

export default function MainMenu() {
  return (
    <main className="relative flex flex-1 justify-center overflow-hidden px-6">
      <div className="relative flex w-full max-w-[390px] flex-col justify-between py-16">
        <div className="flex flex-1 items-center justify-center pb-10">
          <Logo />
        </div>

        <nav className="flex flex-col gap-3" aria-label="Main menu">
          <Link
            href="/match"
            className="grid h-16 w-full place-items-center rounded-2xl bg-accent font-display text-xl font-bold uppercase tracking-wider text-bg-primary shadow-[0_8px_32px_-8px_rgba(62,213,152,0.55)] transition-colors hover:bg-accent-hover active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            Play
          </Link>
          <button
            type="button"
            className="h-14 w-full rounded-2xl border border-border-subtle bg-bg-primary/60 font-display text-base font-semibold uppercase tracking-wider text-text-primary transition-colors hover:border-text-muted-2 hover:bg-bg-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            Practice
          </button>
          <button
            type="button"
            className="h-12 w-full rounded-2xl font-display text-sm font-semibold uppercase tracking-widest text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            How to Play
          </button>
        </nav>
      </div>
    </main>
  );
}
