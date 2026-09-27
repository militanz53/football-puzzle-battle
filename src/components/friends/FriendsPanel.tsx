"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addFriend,
  answerRequest,
  challengeFriend,
  findPlayers,
  loadFriends,
  waitForChallenge,
  withdrawChallenge,
} from "@/app/friends/actions";
import type { Invite } from "@/lib/friends/challenges";
import type { FriendsOverview, PlayerSummary, Relation } from "@/lib/friends/friends";
import { USERNAME_MAX } from "@/lib/account/rules";
import { ChallengeInbox } from "./ChallengeInbox";

/** The waiting screen checks in this often (it also keeps the challenge alive on the server). */
const WAIT_POLL_MS = 2_000;
const SEARCH_DELAY_MS = 250;

const card = "rounded-[20px] border border-border-subtle bg-bg-surface p-4";
const heading = "font-display text-[11px] font-semibold uppercase tracking-widest text-text-muted";
const small = "h-9 shrink-0 rounded-xl px-3 font-display text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-60";
const primary = `${small} bg-accent text-bg-primary hover:bg-accent-hover`;
const secondary = `${small} border border-border-subtle text-text-primary hover:bg-bg-surface-alt`;

function Player({ player, children }: { player: PlayerSummary; children?: React.ReactNode }) {
  return (
    <li data-player={player.username} className="flex items-center gap-3 py-2">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border-subtle bg-bg-surface-alt font-display text-sm font-bold text-text-secondary">
        {player.username[0]?.toLocaleUpperCase("tr")}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate font-display text-sm font-bold text-text-primary">{player.username}</span>
        <span className="block font-display text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {player.tier} · <span className="tabular-nums">{player.rating}</span>
        </span>
      </span>
      {children}
    </li>
  );
}

type Waiting =
  | { kind: "idle" }
  | { kind: "waiting"; id: string; opponent: PlayerSummary }
  | { kind: "ended"; text: string };

/** The Friends page: search and add, answer requests, and challenge a friend to a friendly match. */
export function FriendsPanel({ initial, inbox, invites }: { initial: FriendsOverview; inbox: string; invites: Invite[] }) {
  const router = useRouter();
  const [overview, setOverview] = useState(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(PlayerSummary & { relation: Relation })[]>([]);
  const [notice, setNotice] = useState<{ text: string; good: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<Waiting>({ kind: "idle" });

  // Search as you type (from two characters), a moment after the last key.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    let stale = false;
    const timer = window.setTimeout(async () => {
      const found = await findPlayers(text).catch(() => []);
      if (!stale) setResults(found);
    }, SEARCH_DELAY_MS);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [query, overview]);
  const shownResults = query.trim().length < 2 ? [] : results;

  async function run(action: () => Promise<{ ok: boolean; overview: FriendsOverview } & ({ message: string } | { error: string })>) {
    setBusy(true);
    try {
      const reply = await action();
      setOverview(reply.overview);
      setNotice("message" in reply ? { text: reply.message, good: true } : { text: reply.error, good: false });
    } finally {
      setBusy(false);
    }
  }

  // Waiting for a challenged friend: poll (which keeps the challenge alive), and ask
  // again at once when the inbox says something changed.
  const check = useRef<() => void>(() => {});
  useEffect(() => {
    if (waiting.kind !== "waiting") return;
    let done = false;
    const tick = async () => {
      const result = await waitForChallenge(waiting.id).catch(() => null);
      if (done || !result) return;
      if (result.status === "accepted" && result.matchId) {
        done = true;
        router.push(`/friendly/${result.matchId}`);
      } else if (result.status === "declined") {
        setWaiting({ kind: "ended", text: `${waiting.opponent.username} declined.` });
      } else if (result.status !== "pending" && result.status !== "accepted") {
        setWaiting({ kind: "ended", text: `No answer from ${waiting.opponent.username}.` });
      }
    };
    check.current = () => void tick();
    const timer = window.setInterval(tick, WAIT_POLL_MS);
    return () => {
      done = true;
      window.clearInterval(timer);
      check.current = () => {};
    };
  }, [waiting, router]);

  const onInbox = useCallback(() => {
    check.current();
    void loadFriends().then(setOverview, () => {});
  }, []);

  async function challenge(friend: PlayerSummary) {
    setBusy(true);
    setNotice(null);
    try {
      const sent = await challengeFriend(friend.username);
      if (sent.ok) setWaiting({ kind: "waiting", id: sent.challengeId, opponent: sent.opponent });
      else setNotice({ text: sent.error, good: false });
    } finally {
      setBusy(false);
    }
  }

  async function stopWaiting() {
    if (waiting.kind === "waiting") await withdrawChallenge(waiting.id).catch(() => {});
    setWaiting({ kind: "idle" });
  }

  return (
    <div className="flex flex-col gap-3">
      <ChallengeInbox channel={inbox} initial={invites} onChange={onInbox} />

      {waiting.kind !== "idle" && (
        <section role="status" aria-live="polite" className={`${card} border-accent/40 text-center`}>
          {waiting.kind === "waiting" ? (
            <>
              <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-accent">Friendly challenge</p>
              <p className="mt-1 font-display text-lg font-bold motion-safe:animate-pulse">Waiting for {waiting.opponent.username}…</p>
              <p className="mt-1 text-sm text-text-secondary">Keep this page open. The match starts when they accept.</p>
              <button type="button" onClick={() => void stopWaiting()} className={`${secondary} mt-3`}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <p className="font-display text-base font-bold">{waiting.text}</p>
              <button type="button" onClick={() => setWaiting({ kind: "idle" })} className={`${secondary} mt-3`}>
                OK
              </button>
            </>
          )}
        </section>
      )}

      <section className={card} aria-labelledby="find-heading">
        <h2 id="find-heading" className={heading}>
          Add a friend
        </h2>
        <input
          type="search"
          aria-label="Search by username"
          placeholder="Search by username"
          value={query}
          maxLength={USERNAME_MAX}
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setNotice(null);
          }}
          className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-bg-primary px-4 text-base text-text-primary outline-none transition-colors placeholder:text-text-muted-2 focus:border-accent"
        />
        {notice && (
          <p role="status" className={`mt-2 text-sm ${notice.good ? "text-accent" : "text-red-300"}`}>
            {notice.text}
          </p>
        )}
        {shownResults.length > 0 && (
          <ul aria-label="Search results" className="mt-1 divide-y divide-border-subtle">
            {shownResults.map((p) => (
              <Player key={p.username} player={p}>
                {p.relation === "none" || p.relation === "request-received" ? (
                  <button type="button" disabled={busy} onClick={() => void run(() => addFriend(p.username))} className={primary}>
                    Add Friend
                  </button>
                ) : (
                  <span className="shrink-0 font-display text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                    {p.relation === "friend" ? "Friend" : p.relation === "request-sent" ? "Pending" : "You"}
                  </span>
                )}
              </Player>
            ))}
          </ul>
        )}
      </section>

      {overview.incoming.length > 0 && (
        <section className={card} aria-labelledby="incoming-heading">
          <h2 id="incoming-heading" className={heading}>
            Friend requests
          </h2>
          <ul className="mt-1 divide-y divide-border-subtle">
            {overview.incoming.map((r) => (
              <Player key={r.requestId} player={r}>
                <button type="button" disabled={busy} onClick={() => void run(() => answerRequest(r.requestId, false))} className={secondary}>
                  Decline
                </button>
                <button type="button" disabled={busy} onClick={() => void run(() => answerRequest(r.requestId, true))} className={primary}>
                  Accept
                </button>
              </Player>
            ))}
          </ul>
        </section>
      )}

      <section className={card} aria-labelledby="friends-heading">
        <h2 id="friends-heading" className={heading}>
          Friends · {overview.friends.length}
        </h2>
        {overview.friends.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">No friends yet. Search for a username above to add one.</p>
        ) : (
          <ul aria-label="Friends" className="mt-1 divide-y divide-border-subtle">
            {overview.friends.map((f) => (
              <Player key={f.username} player={f}>
                <button type="button" disabled={busy || waiting.kind === "waiting"} onClick={() => void challenge(f)} className={primary}>
                  Challenge
                </button>
              </Player>
            ))}
          </ul>
        )}
      </section>

      {overview.outgoing.length > 0 && (
        <section className={card} aria-labelledby="outgoing-heading">
          <h2 id="outgoing-heading" className={heading}>
            Sent requests
          </h2>
          <ul className="mt-1 divide-y divide-border-subtle">
            {overview.outgoing.map((p) => (
              <Player key={p.username} player={p}>
                <span className="shrink-0 font-display text-[11px] font-semibold uppercase tracking-widest text-text-muted">Pending</span>
              </Player>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
