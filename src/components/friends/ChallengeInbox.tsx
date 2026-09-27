"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { incomingInvites, respondToChallenge } from "@/app/friends/actions";
import type { Invite } from "@/lib/friends/challenges";
import { INBOX_EVENT } from "@/lib/friends/inboxEvent";
import { getPublicSupabase } from "@/lib/supabase/public";

/**
 * Listens on the player's inbox channel (src/lib/friends/inbox.ts) and shows the
 * newest challenge: "X challenged you to a match!" with Accept / Decline. Challenges
 * that arrived while no page was open are passed in from the server (`initial`).
 * `onChange` lets the page react to the same events (the Friends page's waiting state).
 */
export function ChallengeInbox({ channel, initial, onChange }: { channel: string; initial: Invite[]; onChange?: () => void }) {
  const router = useRouter();
  const [invites, setInvites] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);

  const refresh = useCallback(async () => {
    try {
      setInvites(await incomingInvites());
    } catch {
      // Offline for a moment: the next event or focus tries again.
    }
  }, []);

  useEffect(() => {
    const db = getPublicSupabase();
    const sub = db
      .channel(channel)
      .on("broadcast", { event: INBOX_EVENT }, () => {
        void refresh();
        changed.current?.();
      })
      .subscribe();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      void db.removeChannel(sub);
    };
  }, [channel, refresh]);

  const invite = invites[0];
  if (!invite) return null;

  async function answer(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await respondToChallenge(invite.challengeId, accept);
      if (result.ok && "matchId" in result) {
        router.push(`/friendly/${result.matchId}`);
        return;
      }
      if (!result.ok) setError(result.error);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <section
        role="alertdialog"
        aria-labelledby="invite-title"
        data-invite
        className="pointer-events-auto w-full max-w-[358px] rounded-[20px] border border-accent/40 bg-bg-surface p-4 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.7),0_0_32px_-12px_rgba(62,213,152,0.6)] backdrop-blur-md motion-safe:animate-pop"
      >
        <p id="invite-title" className="font-display text-base font-bold text-text-primary">
          {invite.from.username} challenged you to a match!
        </p>
        <p className="mt-0.5 font-display text-[11px] font-semibold uppercase tracking-widest text-text-muted">
          Friendly · {invite.from.tier} · <span className="tabular-nums">{invite.from.rating}</span> · no rating at stake
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void answer(false)}
            className="h-11 rounded-xl border border-border-subtle font-display text-sm font-semibold uppercase tracking-wider text-text-primary transition-colors hover:bg-bg-surface-alt disabled:opacity-60"
          >
            Decline
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void answer(true)}
            className="h-11 rounded-xl bg-accent font-display text-sm font-bold uppercase tracking-wider text-bg-primary transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            Accept
          </button>
        </div>
      </section>
    </div>
  );
}
