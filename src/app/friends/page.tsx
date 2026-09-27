import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FriendsPanel } from "@/components/friends/FriendsPanel";
import { currentAccount } from "@/lib/account/auth";
import { incomingChallenges } from "@/lib/friends/challenges";
import { friendsOverview } from "@/lib/friends/friends";
import { inboxChannel, notifyInbox } from "@/lib/friends/inbox";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Friends · Football Puzzle Battle" };

/** Friends (accounts only): add friends, answer requests, challenge a friend to a friendly match. */
export default async function FriendsPage() {
  const account = await currentAccount();
  if (!account) redirect("/account?next=/friends");
  const db = getServerSupabase();
  const [overview, invites, inbox] = await Promise.all([
    friendsOverview(account.userId, db),
    incomingChallenges(account.userId, { db, now: Date.now, notify: notifyInbox }),
    inboxChannel(account.userId),
  ]);

  return (
    <main className="flex flex-1 justify-center px-4">
      <div className="flex w-full max-w-[390px] flex-col py-5">
        <Link
          href="/"
          aria-label="Back to menu"
          className="grid h-9 w-9 place-items-center rounded-full text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <div className="mb-5 mt-4">
          <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-accent">Friends</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Challenge a friend</h1>
          <p className="mt-1 text-sm text-text-secondary">Friendly matches: the same five rounds, no rating at stake.</p>
        </div>
        <FriendsPanel initial={overview} inbox={inbox} invites={invites} />
      </div>
    </main>
  );
}
