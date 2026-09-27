"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { answer, buzzIn, newMatch, nextMatchRound, startMatchRound, syncMatch } from "@/app/match/actions";
import { MATCH_STATE_EVENT, matchChannel } from "@/lib/matchChannel";
import { getPublicSupabase } from "@/lib/supabase/public";
import type { MatchView, PublicRound } from "@/server/match/view";
import { isNewer, notStartedRound, optimisticBuzz, projectRound } from "./display";

const FRAME_MS = 50;
/** A little after the announced change, so the server has certainly reached it. */
const SYNC_MARGIN_MS = 30;
const RETRY_MS = 1000;

/**
 * A match as the server runs it (GDD §27). The browser keeps the latest view it got,
 * from its own calls or from the match's Realtime channel (where a second player's
 * actions will arrive later), draws the running round between views, and asks the
 * server again when the round is due to change. It makes no decisions itself.
 */
export function useServerMatch(initial: MatchView) {
  // Timestamps are performance.now(); the lazy initialisers run again in the browser on hydration.
  const [latest, setLatest] = useState(() => ({ view: initial, receivedAt: performance.now() }));
  const [frame, setFrame] = useState(() => performance.now());
  const [pendingBuzz, setPendingBuzz] = useState<PublicRound | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retry, setRetry] = useState(0);
  const { view, receivedAt } = latest;
  const id = view.id;

  const accept = useCallback((next: MatchView, replace = false) => {
    setLatest((cur) => (replace || isNewer(next, cur.view) ? { view: next, receivedAt: performance.now() } : cur));
  }, []);

  /** Runs a Server Function; on a network error, tries the scheduled sync again shortly. */
  const call = useCallback(
    async (action: () => Promise<MatchView>, replace = false) => {
      try {
        accept(await action(), replace);
      } catch (e) {
        console.warn(`Match request failed: ${(e as Error).message}`);
        window.setTimeout(() => setRetry((n) => n + 1), RETRY_MS);
      }
    },
    [accept],
  );

  // Realtime: every write to the match is broadcast on its channel.
  useEffect(() => {
    const db = getPublicSupabase();
    const channel = db
      .channel(matchChannel(id))
      .on("broadcast", { event: MATCH_STATE_EVENT }, ({ payload }) => accept(payload as MatchView))
      .subscribe();
    return () => void db.removeChannel(channel);
  }, [id, accept]);

  // Redraw the running round smoothly.
  const running = view.round !== null && !view.round.over;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setFrame(performance.now()), FRAME_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  // Ask the server again when it said the round would change (bot buzz, time-out, end).
  useEffect(() => {
    if (view.nextChangeInMs === null) return;
    const wait = Math.max(0, view.nextChangeInMs - (performance.now() - receivedAt)) + SYNC_MARGIN_MS;
    const timer = window.setTimeout(() => void call(() => syncMatch(id)), wait);
    return () => window.clearTimeout(timer);
  }, [view, receivedAt, id, call, retry]);

  // A round on screen that has not started yet starts now, once per round.
  const startedFor = useRef<string | null>(null);
  const roundKey = `${id}:${view.match.rounds.length}`;
  useEffect(() => {
    if (view.match.status !== "playing" || view.round || startedFor.current === roundKey) return;
    startedFor.current = roundKey;
    void call(() => startMatchRound(id));
  }, [view.match.status, view.round, roundKey, id, call]);

  // Until the next frame, a just-received view is drawn as it came.
  const elapsed = Math.max(0, frame - receivedAt);
  const shown = view.round
    ? projectRound(view.round, elapsed, view.nextChangeInMs)
    : view.match.status === "playing"
      ? notStartedRound(view.match.current)
      : null;
  const round = pendingBuzz && shown?.player.kind === "waiting" ? pendingBuzz : shown;

  const buzz = useCallback(() => {
    const optimistic = shown && optimisticBuzz(shown);
    if (!optimistic) return;
    setPendingBuzz(optimistic);
    void call(() => buzzIn(id)).finally(() => setPendingBuzz(null));
  }, [shown, call, id]);

  const submit = useCallback(
    (text: string) => {
      if (submitting) return;
      setSubmitting(true);
      void call(() => answer(id, text)).finally(() => setSubmitting(false));
    },
    [submitting, call, id],
  );

  // The result screen moves on by itself and on tap; only the first counts.
  const leftResult = useRef<string | null>(null);
  const next = useCallback(() => {
    if (view.match.status !== "round-result" || leftResult.current === roundKey) return;
    leftResult.current = roundKey;
    void call(() => nextMatchRound(id));
  }, [view.match.status, roundKey, call, id]);

  const rematching = useRef(false);
  const rematch = useCallback(async () => {
    if (rematching.current) return; // ignore repeat taps while the new match is drawn
    rematching.current = true;
    try {
      await call(() => newMatch(), true);
    } finally {
      rematching.current = false;
    }
  }, [call]);

  return { view, round, submitting, buzz, submit, next, rematch };
}
