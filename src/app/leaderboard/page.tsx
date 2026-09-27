import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { LeaderboardList } from "@/components/leaderboard/LeaderboardList";
import { currentAccount } from "@/lib/account/auth";
import { LEADERBOARD_SIZE, leaderboardEntry, leaderboardPage, topPlayers } from "@/lib/leaderboard";
import { getPublicSupabase } from "@/lib/supabase/public";

export const metadata: Metadata = { title: "Leaderboard · Football Puzzle Battle" };

/**
 * The Ranked leaderboard (§14): open to everyone. Read with the publishable key from
 * the public view, so nothing but public columns can reach the page. Signed in, your
 * own line is marked (and shown below the list if you are further down).
 */
export default async function LeaderboardPage() {
  await connection();
  const db = getPublicSupabase();
  const [entries, account] = await Promise.all([topPlayers(LEADERBOARD_SIZE, db), currentAccount()]);
  const you = account ? await leaderboardEntry(account.username, db) : null;
  const page = leaderboardPage(entries, you);

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
          <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-accent">Ranked</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Leaderboard</h1>
          <p className="mt-1 text-sm text-text-secondary">The top {LEADERBOARD_SIZE} by rating. One ranked match puts you on the board.</p>
        </div>

        <LeaderboardList page={page} />

        <div className="mt-6 text-center">
          {!account ? (
            <Link
              href="/account?next=/leaderboard"
              className="inline-block rounded-2xl border border-accent/50 px-5 py-3 font-display text-sm font-semibold uppercase tracking-wider text-accent transition-colors hover:border-accent"
            >
              Sign in to see your rank
            </Link>
          ) : !you ? (
            <p className="text-sm text-text-secondary">
              You are not ranked yet.{" "}
              <Link href="/ranked" className="font-semibold text-accent underline underline-offset-4">
                Play a ranked match
              </Link>{" "}
              to get on the board.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
