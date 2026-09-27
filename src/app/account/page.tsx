import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPanel } from "@/components/account/AuthPanel";
import { currentAccount } from "@/lib/account/auth";
import { safeAccountNext } from "@/lib/account/rules";

export const metadata: Metadata = { title: "Account · Football Puzzle Battle" };

/** Sign up or sign in for Ranked (§13.5). A signed-in player goes straight on. */
export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const params = await searchParams;
  const next = safeAccountNext(params.next);
  if (await currentAccount()) redirect(next);

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
        <div className="mb-6 mt-6 text-center">
          <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-accent">Ranked</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Play for your rank</h1>
          <p className="mx-auto mt-2 max-w-[18rem] text-sm leading-snug text-text-secondary">
            Ranked needs an account: your username and rating stay with you. Quick Match works without one.
          </p>
        </div>
        <AuthPanel next={next} initialTab={params.tab === "signin" ? "signin" : "signup"} />
      </div>
    </main>
  );
}
