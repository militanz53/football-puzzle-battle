// Main Menu — GDD §21 (first prototype: PLAY, PRACTICE, HOW TO PLAY) styled per §22.
// QUICK MATCH opens the 5-round match, RANKED the ranked one (§13.5), FRIENDS the
// friends list and challenges (§13.2); both need an account. PRACTICE and HOW TO PLAY
// are still inert.

import Image from "next/image";
import Link from "next/link";
import { ChallengeInbox } from "@/components/friends/ChallengeInbox";
import { AccountChip } from "@/components/menu/AccountChip";
import { MenuLobby } from "@/components/menu/MenuLobby";
import { SoundToggle } from "@/components/sound/SoundToggle";
import { randomPlayerName } from "@/lib/nickname";
import { currentAccount } from "@/lib/account/auth";
import { incomingChallenges } from "@/lib/friends/challenges";
import { inboxChannel, notifyInbox } from "@/lib/friends/inbox";
import { getServerSupabase } from "@/lib/supabase/server";
import { readIdentity } from "@/lib/session";
import stadium from "../../public/images/stadium-bg.png";

/**
 * The night stadium behind the menu, under navy so it never competes with the text.
 * The photo is lifted so its centre circle (57% down the image) sits behind the
 * wordmark, about a third of the way down the screen.
 */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Phones: the frame starts 60% above the screen and the photo fills its height.
          Wide screens: the photo is cropped by width, so it is aimed with object-position. */}
      <div className="absolute inset-x-0 bottom-0 top-[-60%] md:top-0">
        <Image
          src={stadium}
          alt=""
          fill
          preload
          sizes="100vw"
          placeholder="blur"
          className="object-cover object-center md:object-[50%_68%]"
        />
      </div>
      {/* Light over the pitch behind the wordmark; deeper behind the cards, where the
          pitch lines should only just show through. */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(11,18,32,0.5)_0%,rgba(11,18,32,0.25)_22%,rgba(11,18,32,0.35)_45%,rgba(11,18,32,0.62)_60%,rgba(11,18,32,0.72)_80%,rgba(11,18,32,0.88)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(11,18,32,0.7)_100%)]" />
    </div>
  );
}

function Logo() {
  return (
    <div className="relative flex flex-col items-center gap-4">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-[18px] border border-accent/30 bg-bg-surface/80 shadow-[0_0_56px_-6px_rgba(62,213,152,0.6)] backdrop-blur-sm">
        <svg viewBox="0 0 48 48" className="h-9 w-9" aria-hidden>
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
      <h1 className="relative text-center font-display text-[2.5rem] font-bold uppercase leading-[0.95] tracking-tight drop-shadow-[0_2px_12px_rgba(11,18,32,0.9)]">
        <span className="block text-text-primary">Football</span>
        <span className="block text-text-primary">Puzzle</span>
        <span className="block text-accent drop-shadow-[0_0_18px_rgba(62,213,152,0.55)]">Battle</span>
      </h1>
      <p className="relative max-w-[16rem] text-center text-[15px] leading-snug text-text-secondary [text-shadow:0_1px_2px_rgba(11,18,32,0.95),0_0_14px_rgba(11,18,32,0.95)]">
        Know it before your opponent does.
      </p>
    </div>
  );
}

export default async function MainMenu() {
  // The nickname and the account live in cookies, so the menu renders per request.
  const [identity, account] = await Promise.all([readIdentity(), currentAccount()]);
  // Signed in: challenges from friends show up here too, live over the inbox channel.
  const inbox = account
    ? {
        channel: await inboxChannel(account.userId),
        invites: await incomingChallenges(account.userId, { db: getServerSupabase(), now: Date.now, notify: notifyInbox }),
      }
    : null;
  return (
    <main className="relative isolate flex flex-1 justify-center overflow-hidden px-4">
      <Backdrop />
      {inbox && <ChallengeInbox channel={inbox.channel} initial={inbox.invites} />}
      <div className="relative flex w-full max-w-[390px] flex-col py-5">
        <div className="flex items-center justify-between gap-3">
          <AccountChip account={account} />
          <SoundToggle />
        </div>
        <div className="flex flex-1 items-center justify-center pb-5 pt-1">
          <Logo />
        </div>

        {/* The placeholder previews the kind of name an empty box gets (drawn here, so it hydrates the same). */}
        <MenuLobby current={identity?.name ?? null} example={randomPlayerName(Math.random)} />

        <nav className="mt-5 flex flex-col gap-3" aria-label="Main menu">
          <Link
            href="/match"
            className="grid h-16 w-full place-items-center rounded-2xl bg-accent font-display text-xl font-bold uppercase tracking-wider text-bg-primary shadow-[0_0_28px_-2px_rgba(62,213,152,0.55),0_10px_40px_-8px_rgba(62,213,152,0.7)] transition-colors hover:bg-accent-hover active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            Quick Match
          </Link>
          <div className="grid grid-cols-3 gap-2">
            {/* Signed out, /ranked and /friends send the player to the account screen first. */}
            <Link
              href="/ranked"
              className="grid h-14 w-full place-items-center rounded-2xl border border-accent/50 bg-bg-primary/60 font-display text-sm font-semibold uppercase tracking-wider text-accent backdrop-blur-sm transition-colors hover:border-accent hover:bg-bg-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              Ranked
            </Link>
            <Link
              href="/friends"
              className="grid h-14 w-full place-items-center rounded-2xl border border-border-subtle bg-bg-primary/60 font-display text-sm font-semibold uppercase tracking-wider text-text-primary backdrop-blur-sm transition-colors hover:border-text-muted-2 hover:bg-bg-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              Friends
            </Link>
            <button
              type="button"
              className="h-14 w-full rounded-2xl border border-border-subtle bg-bg-primary/60 font-display text-sm font-semibold uppercase tracking-wider text-text-primary backdrop-blur-sm transition-colors hover:border-text-muted-2 hover:bg-bg-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              Practice
            </button>
          </div>
          <div className="mt-1 flex justify-center gap-2">
            <Link
              href="/leaderboard"
              className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-widest text-accent underline decoration-accent/40 underline-offset-4 transition-colors hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              Leaderboard
            </Link>
            <button
              type="button"
              className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-widest text-text-secondary underline decoration-text-muted-2 underline-offset-4 transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              How to Play
            </button>
          </div>
        </nav>
      </div>
    </main>
  );
}
