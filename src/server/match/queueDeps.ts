import "server-only";
import { getProfile } from "@/lib/account/profiles";
import { getServerSupabase } from "@/lib/supabase/server";
import type { QueueDeps, QueuedPlayer } from "./queue";
import { supabaseQueueStore } from "./queueStore";
import { createMatch, defaultDeps, type MatchDeps, viewMatch } from "./runner";
import type { Players } from "./service";

// What the queue (./queue.ts) needs, wired to Supabase, for the browser whose
// anonymous session is `session`. Shared by Quick Match and Ranked Server Functions.

/**
 * A ranked match: both seats carry their account and rating as the match begins
 * (the Elo base, §14), and each is named by their username.
 */
async function createRankedMatch(deps: MatchDeps, a: QueuedPlayer, b: QueuedPlayer) {
  const [profileA, profileB] = await Promise.all([getProfile(a.userId!, deps.db), getProfile(b.userId!, deps.db)]);
  if (!profileA || !profileB) throw new Error("A ranked player has no profile");
  const players: Players = {
    a: { session: a.sessionId, name: profileA.username, account: { userId: profileA.userId, rating: profileA.rating } },
    b: { session: b.sessionId, name: profileB.username, account: { userId: profileB.userId, rating: profileB.rating } },
    since: deps.now(),
  };
  return createMatch(
    deps,
    profileB.username,
    { opponentKind: "human", queueEntryId: null, playerSession: a.sessionId, opponentSession: b.sessionId, mode: "ranked" },
    players,
  );
}

export function queueDeps(session: string): QueueDeps {
  const deps = defaultDeps();
  return {
    store: supabaseQueueStore(getServerSupabase()),
    now: deps.now,
    rng: deps.rng,
    // The engine's opponent plays every Quick Match nobody else joined (see queue.ts).
    createMatch: (opponentName, queueEntryId) =>
      createMatch(deps, opponentName, { opponentKind: "bot", queueEntryId, playerSession: session }),
    // One match for two paired players: seat a is the one building it (this browser).
    createRealMatch: (a, b, mode) =>
      mode === "ranked"
        ? createRankedMatch(deps, a, b)
        : createMatch(
            deps,
            b.name,
            { opponentKind: "human", queueEntryId: null, playerSession: a.sessionId, opponentSession: b.sessionId },
            { a: { session: a.sessionId, name: a.name }, b: { session: b.sessionId, name: b.name }, since: deps.now() },
          ),
    viewMatch: (matchId) => viewMatch(matchId, deps, session),
  };
}
