import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDatabase, fakeTable, type FakeTable } from "@/test/fakeSupabase";
import {
  answerChallenge,
  cancelChallenge,
  CHALLENGE_WAIT_MS,
  CHALLENGER_STALE_MS,
  checkChallenge,
  type CreateFriendlyMatch,
  incomingChallenges,
  sendChallenge,
} from "./challenges";

// Challenges between friends over in-memory tables. `notify` stands in for the
// Realtime inbox, so the tests can see exactly who was told.

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const CARA = "00000000-0000-4000-8000-00000000000c";
const T0 = 1_750_000_000_000;

let tables: Record<string, FakeTable>;
let now: number;
let notified: string[];
let created: Parameters<CreateFriendlyMatch>[];
let deps: Parameters<typeof answerChallenge>[4];

beforeEach(() => {
  const profile = (user_id: string, username: string, rating: number) => ({ user_id, username, rating, matches_played: 0, matches_won: 0, matches_lost: 0 });
  tables = {
    profiles: fakeTable([profile(ALICE, "Alice", 1250), profile(BOB, "Bob", 1180), profile(CARA, "Cara", 1420)]),
    // Alice and Bob are friends; Cara is nobody's.
    friendships: fakeTable([{ user_a: ALICE, user_b: BOB }]),
    challenges: fakeTable(),
  };
  tables.challenges.defaults = () => ({ id: crypto.randomUUID(), status: "pending", match_id: null });
  now = T0;
  notified = [];
  created = [];
  deps = {
    db: fakeDatabase(tables),
    now: () => now,
    notify: vi.fn(async (id: string) => void notified.push(id)),
    createFriendlyMatch: vi.fn(async (...seats: Parameters<CreateFriendlyMatch>) => {
      created.push(seats);
      return `match-${created.length}`;
    }),
  };
});

const invitesFor = async (id: string) => (await incomingChallenges(id, deps)).map((i) => i.from.username);

describe("sending a challenge", () => {
  it("goes to that friend only, and tells only them", async () => {
    const sent = await sendChallenge(ALICE, "session-alice", "bob", deps);
    expect(sent).toMatchObject({ ok: true, opponent: { username: "Bob", rating: 1180 } });
    expect(notified).toEqual([BOB]);
    expect(await invitesFor(BOB)).toEqual(["Alice"]);
    expect(await invitesFor(CARA)).toEqual([]);
    expect(await invitesFor(ALICE)).toEqual([]);
  });

  it("is refused for someone who is not a friend, or unknown, or yourself", async () => {
    for (const name of ["Cara", "nobody", "Alice"]) {
      expect(await sendChallenge(ALICE, "session-alice", name, deps)).toEqual({ ok: false, error: "You can only challenge your friends." });
    }
    expect(tables.challenges.rows).toEqual([]);
    expect(notified).toEqual([]);
  });

  it("withdraws an earlier open challenge", async () => {
    tables.friendships.rows.push({ user_a: ALICE, user_b: CARA });
    await sendChallenge(ALICE, "session-alice", "Bob", deps);
    await sendChallenge(ALICE, "session-alice", "Cara", deps);
    expect(await invitesFor(BOB)).toEqual([]);
    expect(await invitesFor(CARA)).toEqual(["Alice"]);
    expect(notified).toEqual([BOB, CARA, BOB]); // Bob is told his invite is gone
  });
});

describe("answering a challenge", () => {
  async function challenge() {
    const sent = await sendChallenge(ALICE, "session-alice", "Bob", deps);
    if (!sent.ok) throw new Error(sent.error);
    notified.length = 0;
    return sent.challengeId;
  }

  it("accept: the match is made at once, challenger in seat a, and the challenger is told", async () => {
    const id = await challenge();
    expect(await answerChallenge(BOB, "session-bob", id, true, deps)).toEqual({ ok: true, matchId: "match-1" });
    expect(created).toHaveLength(1);
    const [challenger, accepter] = created[0];
    expect([challenger.session, challenger.profile.username]).toEqual(["session-alice", "Alice"]);
    expect([accepter.session, accepter.profile.username]).toEqual(["session-bob", "Bob"]);
    expect(notified).toEqual([ALICE]);
    expect(await checkChallenge(ALICE, id, deps)).toEqual({ status: "accepted", matchId: "match-1" });
    expect(await invitesFor(BOB)).toEqual([]);
  });

  it("decline: no match, and the challenger is told", async () => {
    const id = await challenge();
    expect(await answerChallenge(BOB, "session-bob", id, false, deps)).toEqual({ ok: true, declined: true });
    expect(created).toEqual([]);
    expect(notified).toEqual([ALICE]);
    expect(await checkChallenge(ALICE, id, deps)).toEqual({ status: "declined", matchId: null });
  });

  it("only the challenged friend can answer, and only once: one match", async () => {
    const id = await challenge();
    expect(await answerChallenge(CARA, "session-cara", id, true, deps)).toMatchObject({ ok: false });
    expect(await answerChallenge(ALICE, "session-x", id, true, deps)).toMatchObject({ ok: false });
    await answerChallenge(BOB, "session-bob", id, true, deps);
    expect(await answerChallenge(BOB, "session-bob", id, true, deps)).toEqual({ ok: false, error: "This challenge is no longer open." });
    expect(created).toHaveLength(1);
  });

  it("cannot be accepted once the challenger stopped waiting", async () => {
    const id = await challenge();
    now += CHALLENGER_STALE_MS + 1;
    expect(await invitesFor(BOB)).toEqual([]); // no longer shown
    expect(await answerChallenge(BOB, "session-bob", id, true, deps)).toEqual({ ok: false, error: "Alice is no longer waiting." });
    expect(created).toEqual([]);
  });

  it("stays open while the challenger's screen keeps checking, up to a minute", async () => {
    const id = await challenge();
    for (let t = 0; t < 5; t++) {
      now += 10_000;
      expect(await checkChallenge(ALICE, id, deps)).toEqual({ status: "pending", matchId: null });
    }
    expect(await invitesFor(BOB)).toEqual(["Alice"]);
    now = T0 + CHALLENGE_WAIT_MS;
    expect(await checkChallenge(ALICE, id, deps)).toEqual({ status: "expired", matchId: null });
    expect(await invitesFor(BOB)).toEqual([]);
  });

  it("disappears when the challenger cancels", async () => {
    const id = await challenge();
    await cancelChallenge(BOB, id, deps); // not Bob's to cancel
    expect(await invitesFor(BOB)).toEqual(["Alice"]);
    await cancelChallenge(ALICE, id, deps);
    expect(await invitesFor(BOB)).toEqual([]);
    expect(notified).toEqual([BOB]);
  });

  it("only the challenger can check on it", async () => {
    const id = await challenge();
    expect(await checkChallenge(BOB, id, deps)).toEqual({ status: "expired", matchId: null });
  });
});
