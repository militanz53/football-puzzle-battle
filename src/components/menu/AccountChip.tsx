import Link from "next/link";
import { signOutOfAccount } from "@/app/account/actions";
import type { Profile } from "@/lib/account/profiles";

/**
 * Top left of the menu: the signed-in Ranked account (username, tier, rating) with
 * sign out, or a way to sign in. Quick Match's nickname card is separate.
 */
export function AccountChip({ account }: { account: Profile | null }) {
  if (!account) {
    return (
      <Link
        href="/account?tab=signin"
        className="rounded-full border border-white/10 bg-bg-surface/55 px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-widest text-text-secondary backdrop-blur-md transition-colors hover:text-text-primary"
      >
        Sign in
      </Link>
    );
  }
  return (
    <div data-account className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-bg-surface/55 py-1 pl-1 pr-1 backdrop-blur-md">
      <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent bg-accent/10 font-display text-xs font-bold text-accent">
        {account.username[0]?.toLocaleUpperCase("tr")}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-display text-xs font-bold text-text-primary">{account.username}</span>
        <span className="block font-display text-[10px] font-semibold uppercase tracking-wider text-accent">
          {account.tier} · <span className="tabular-nums">{account.rating}</span>
        </span>
      </span>
      <form action={signOutOfAccount}>
        <button
          type="submit"
          className="ml-1 rounded-full px-2.5 py-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-text-muted transition-colors hover:bg-bg-surface-alt hover:text-text-primary"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
