import { beforeEach, describe, expect, it } from "vitest";
import { fakeDatabase, fakeTable, type FakeTable } from "@/test/fakeSupabase";
import { answerFriendRequest, friendsOverview, searchPlayers, sendFriendRequest } from "./friends";

// Friend requests over in-memory tables that keep the migration's unique rules:
// one pending request per direction, one friendship per pair.

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const CARA = "00000000-0000-4000-8000-00000000000c";

let tables: Record<string, FakeTable>;
let db: ReturnType<typeof fakeDatabase>;

beforeEach(() => {
  const profile = (user_id: string, username: string, rating: number) => ({ user_id, username, rating, matches_played: 0, matches_won: 0, matches_lost: 0 });
  tables = {
    profiles: fakeTable([profile(ALICE, "Alice", 1250), profile(BOB, "Bob_9", 1180), profile(CARA, "Cara", 1420)]),
    friend_requests: fakeTable(),
    friendships: fakeTable(),
  };
  tables.friend_requests.defaults = () => ({ id: crypto.randomUUID(), status: "pending" });
  tables.friend_requests.unique = [(r) => (r.status === "pending" ? `${r.from_user}>${r.to_user}` : Symbol())];
  tables.friendships.unique = [(r) => `${r.user_a}:${r.user_b}`];
  db = fakeDatabase(tables);
});

describe("friend requests", () => {
  it("sends a request by username, ignoring case", async () => {
    expect(await sendFriendRequest(ALICE, "bob_9", db)).toEqual({ ok: true, message: "Friend request sent to Bob_9." });
    expect(tables.friend_requests.rows).toMatchObject([{ from_user: ALICE, to_user: BOB, status: "pending" }]);
    expect((await friendsOverview(ALICE, db)).outgoing).toEqual([{ username: "Bob_9", rating: 1180, tier: "Semi-Pro" }]);
    expect((await friendsOverview(BOB, db)).incoming).toMatchObject([{ username: "Alice", rating: 1250 }]);
  });

  it("refuses unknown players, yourself and a second request", async () => {
    expect(await sendFriendRequest(ALICE, "nobody", db)).toEqual({ ok: false, error: "No player with that username." });
    expect(await sendFriendRequest(ALICE, "ALICE", db)).toEqual({ ok: false, error: "That's you." });
    await sendFriendRequest(ALICE, "Bob_9", db);
    expect(await sendFriendRequest(ALICE, "Bob_9", db)).toEqual({ ok: false, error: "You already asked Bob_9." });
  });

  it("does not treat _ or % in a username search as wildcards", async () => {
    expect(await sendFriendRequest(ALICE, "Bob%", db)).toMatchObject({ ok: false });
    expect(await sendFriendRequest(ALICE, "B_b_9", db)).toMatchObject({ ok: false });
  });

  it("accept: both see each other as friends, and the request is closed", async () => {
    await sendFriendRequest(ALICE, "Bob_9", db);
    const { requestId } = (await friendsOverview(BOB, db)).incoming[0];
    expect(await answerFriendRequest(BOB, requestId, true, db)).toEqual({ ok: true, message: "Friend added." });
    expect((await friendsOverview(ALICE, db)).friends.map((f) => f.username)).toEqual(["Bob_9"]);
    expect(await friendsOverview(BOB, db)).toEqual({ friends: [{ username: "Alice", rating: 1250, tier: "Pro" }], incoming: [], outgoing: [] });
    expect(tables.friendships.rows).toEqual([{ user_a: ALICE, user_b: BOB }]);
    expect(await sendFriendRequest(BOB, "Alice", db)).toEqual({ ok: false, error: "Alice is already your friend." });
  });

  it("decline: no friendship, and the sender may ask again later", async () => {
    await sendFriendRequest(ALICE, "Bob_9", db);
    const { requestId } = (await friendsOverview(BOB, db)).incoming[0];
    expect(await answerFriendRequest(BOB, requestId, false, db)).toEqual({ ok: true, message: "Request declined." });
    expect(tables.friendships.rows).toEqual([]);
    expect(await friendsOverview(ALICE, db)).toEqual({ friends: [], incoming: [], outgoing: [] });
    expect((await sendFriendRequest(ALICE, "Bob_9", db)).ok).toBe(true);
  });

  it("only the receiver can answer a request, and only once", async () => {
    await sendFriendRequest(ALICE, "Bob_9", db);
    const { requestId } = (await friendsOverview(BOB, db)).incoming[0];
    expect(await answerFriendRequest(ALICE, requestId, true, db)).toMatchObject({ ok: false }); // the sender
    expect(await answerFriendRequest(CARA, requestId, true, db)).toMatchObject({ ok: false }); // a stranger
    expect(tables.friendships.rows).toEqual([]);
    await answerFriendRequest(BOB, requestId, false, db);
    expect(await answerFriendRequest(BOB, requestId, true, db)).toEqual({ ok: false, error: "That request is no longer open." });
  });

  it("asking someone who already asked you makes you friends at once", async () => {
    await sendFriendRequest(ALICE, "Bob_9", db);
    expect(await sendFriendRequest(BOB, "Alice", db)).toEqual({ ok: true, message: "You and Alice are now friends." });
    expect(tables.friendships.rows).toHaveLength(1);
    expect(tables.friend_requests.rows).toHaveLength(1);
  });

  it("shows other players only what concerns them", async () => {
    await sendFriendRequest(ALICE, "Bob_9", db);
    expect(await friendsOverview(CARA, db)).toEqual({ friends: [], incoming: [], outgoing: [] });
  });
});

describe("player search", () => {
  it("finds usernames by prefix and says where each stands", async () => {
    await sendFriendRequest(ALICE, "Bob_9", db);
    expect(await searchPlayers(ALICE, "b", db)).toEqual([]); // too short
    expect(await searchPlayers(ALICE, "bo", db)).toEqual([{ username: "Bob_9", rating: 1180, tier: "Semi-Pro", relation: "request-sent" }]);
    expect(await searchPlayers(BOB, "al", db)).toMatchObject([{ username: "Alice", relation: "request-received" }]);
    expect(await searchPlayers(ALICE, "al", db)).toMatchObject([{ username: "Alice", relation: "self" }]);
    expect(await searchPlayers(ALICE, "ca", db)).toMatchObject([{ username: "Cara", relation: "none" }]);
  });
});
