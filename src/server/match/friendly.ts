import "server-only";
import type { CreateFriendlyMatch } from "@/lib/friends/challenges";
import { createMatch, type MatchDeps } from "./runner";

// A friendly match between two friends (§13.2): made directly when a challenge is
// accepted, no queue. The same server-run match as Quick Match and Ranked; seats carry
// the two accounts (so both are named by username), and mode "friendly" keeps ratings
// out of it (only a ranked match is ever settled, ./ranked.ts).

export function friendlyMatchMaker(deps: MatchDeps): CreateFriendlyMatch {
  return async (challenger, accepter) => {
    const seat = ({ session, profile }: { session: string; profile: typeof challenger.profile }) => ({
      session,
      name: profile.username,
      account: { userId: profile.userId, rating: profile.rating },
    });
    const view = await createMatch(
      deps,
      accepter.profile.username,
      { opponentKind: "human", queueEntryId: null, playerSession: challenger.session, opponentSession: accepter.session, mode: "friendly" },
      { a: seat(challenger), b: seat(accepter), since: deps.now() },
    );
    return view.id;
  };
}
