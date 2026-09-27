import { describe, expect, it } from "vitest";
import { seeded } from "@/game/__fixtures__/seeded";
import { buildSchedule, ROUND_ORDER } from "@/game/match";
import type { Puzzle } from "@/game/types";
import { loadSnapshot } from "@/test/snapshot";
import {
  buzz,
  catchUp,
  type Clock,
  forfeitIfGone,
  LEAVE_AFTER_MS,
  linkRematch,
  type MatchRecord,
  START_GRACE_MS,
  newMatchRecord,
  nextRound,
  requestRematch,
  startRound,
  submitAnswer,
} from "./service";
import { hideAnswer, summaryColumns, toView } from "./view";

// The server's match rules over a fake clock. The engine itself is tested in src/game.

const POOL = loadSnapshot();
const T0 = 1_750_000_000_000;
const loadPool = async () => POOL;

function freshMatch(seed = 1): MatchRecord {
  return { id: "m1", ...newMatchRecord(buildSchedule(POOL, seeded(seed)), "Emre_34") };
}
const clock = (ms: number, seed = 7): Clock => ({ now: T0 + ms, rng: seeded(seed) });
/** A bot that never buzzes, so a test controls the whole round. */
const quietBot = (r: MatchRecord): MatchRecord =>
  r.round ? { ...r, round: { ...r.round, botPlan: { buzzReveal: 5, buzzAtMs: 1e9, answerDelayMs: 2000, correct: false } } } : r;
const started = (r = freshMatch()) => quietBot(startRound(r, clock(0)).record);

describe("starting a round", () => {
  it("starts the first round on the server clock with a server-side bot plan (§29.1)", () => {
    const { record, changed } = startRound(freshMatch(), clock(0));
    expect(changed).toBe(true);
    expect(record.round?.startedAt).toBe(T0);
    expect(record.round?.botPlan?.buzzReveal).toBeGreaterThanOrEqual(2);
  });

  it("is idempotent: a second start keeps the first start time", () => {
    const once = startRound(freshMatch(), clock(0)).record;
    expect(startRound(once, clock(5_000))).toEqual({ record: once, changed: false });
  });
});

describe("buzzing and answering", () => {
  it("scores by the server's time of the buzz (§8)", () => {
    let r = started();
    r = buzz(r, clock(3_400)).record; // reveal 2
    r = submitAnswer(r, clock(4_000), r.match.current.correct_answer).record;
    const view = toView(r, T0 + 4_000);
    expect(view.round?.player).toMatchObject({ kind: "correct", points: 800 });
  });

  it("refuses a buzz while the bot answers, without storing it", () => {
    let r = startRound(freshMatch(), clock(0)).record;
    r = { ...r, round: { ...r.round!, botPlan: { buzzReveal: 1, buzzAtMs: 1_000, answerDelayMs: 2_000, correct: false } } };
    const result = buzz(r, clock(1_500));
    expect(result.accepted).toBe(false);
    expect(result.record.round?.events).toEqual([]);
  });

  it("ignores an answer from a player who has not buzzed", () => {
    const result = submitAnswer(started(), clock(1_000), "anything");
    expect(result.accepted).toBe(false);
    expect(result.changed).toBe(false);
  });

  it("checks the answer on the server: aliases and accents count (§26.1)", () => {
    let r = started();
    const alias = r.match.current.answer_aliases[0];
    r = buzz(r, clock(500)).record;
    r = submitAnswer(r, clock(900), `  ${alias.toUpperCase()} `).record;
    expect(toView(r, T0 + 900).round?.player).toMatchObject({ kind: "correct", points: 1000 });
  });
});

describe("finishing rounds and the match", () => {
  it("records a finished round only once the server clock gets there", () => {
    const r = started();
    expect(catchUp(r, T0 + 14_000).changed).toBe(false);
    const after = catchUp(r, T0 + 15_050);
    expect(after.changed).toBe(true);
    expect(after.record.match.status).toBe("round-result");
    expect(after.record.round).toBeNull();
    expect(after.record.match.rounds[0]).toMatchObject({ player: { kind: "no-buzz" }, bot: { kind: "no-buzz" } });
  });

  it("will not move on before the round is over", async () => {
    const r = started();
    expect(await nextRound(r, clock(5_000), loadPool)).toEqual({ record: r, changed: false });
  });

  it("plays the five types in §5 order, then goes to Sudden Death on a tie (§12.1)", async () => {
    let r = started();
    const types: Puzzle["type"][] = [];
    for (let i = 0; i < 5; i++) {
      types.push(r.match.current.type);
      const end = r.round!.startedAt - T0 + 15_100;
      r = (await nextRound(catchUp(r, T0 + end).record, clock(end + 3_500), loadPool)).record;
      r = quietBot(r);
    }
    expect(types).toEqual(ROUND_ORDER);
    expect(r.match.suddenDeath).toBe(true);
    expect(r.match.status).toBe("playing");
    expect(r.round).not.toBeNull();
  });

  it("ends Sudden Death at the first correct answer and names the winner", async () => {
    let r = started();
    for (let i = 0; i < 5; i++) {
      const end = r.round!.startedAt - T0 + 15_100;
      r = quietBot((await nextRound(catchUp(r, T0 + end).record, clock(end + 3_500), loadPool)).record);
    }
    const t = r.round!.startedAt - T0;
    r = buzz(r, clock(t + 400)).record;
    r = submitAnswer(r, clock(t + 900), r.match.current.correct_answer).record;
    expect(r.match.status).toBe("round-result");
    r = (await nextRound(r, clock(t + 4_000), loadPool)).record;
    expect(r.match).toMatchObject({ status: "over", winner: "player" });
  });
});

describe("the browser's view", () => {
  it("never carries the bot plan or the answer of a puzzle in play", () => {
    const r = startRound(freshMatch(), clock(0)).record;
    const view = toView(r, T0 + 1_000);
    const json = JSON.stringify(view);
    expect(json).not.toContain("botPlan");
    expect(json).not.toContain("buzzAtMs");
    for (const p of r.match.schedule) {
      expect(json).not.toContain(`"${p.correct_answer}"`);
      for (const alias of p.answer_aliases) expect(json).not.toContain(`"${alias}"`);
    }
    expect(view.match.current.correct_answer).toBe("");
  });

  it("hides the missing player's name in a Missing XI", () => {
    const xi = POOL.find((p) => p.type === "missing_xi")!;
    const hidden = hideAnswer(xi);
    const missing = hidden.type === "missing_xi" ? hidden.reveal_data.lineup.find((s) => s.missing) : undefined;
    expect(missing?.name).toBe("?");
  });

  it("shows the answer once the round is over (§11)", () => {
    const r = catchUp(started(), T0 + 16_000).record;
    const view = toView(r, T0 + 16_000);
    expect(view.match.status).toBe("round-result");
    expect(view.match.rounds[0].puzzle.correct_answer).toBe(r.match.schedule[0].correct_answer);
    expect(view.match.current.correct_answer).toBe(r.match.schedule[0].correct_answer);
  });

  it("tells the browser when to ask again", () => {
    const r = started();
    const view = toView(r, T0 + 10_000);
    expect(view.nextChangeInMs).toBeGreaterThanOrEqual(5_000);
    expect(view.nextChangeInMs).toBeLessThanOrEqual(5_020);
  });

  it("writes whole milliseconds to the integer columns (the bot's buzz time is fractional)", () => {
    let r = startRound(freshMatch(), clock(0)).record;
    r = { ...r, round: { ...r.round!, botPlan: { buzzReveal: 2, buzzAtMs: 3_842.2568, answerDelayMs: 1_700.4, correct: false } } };
    const columns = summaryColumns(r, T0 + 5_000);
    expect(columns.bot_buzz_ms).toBe(3_842);
    for (const value of Object.values(columns)) if (typeof value === "number") expect(Number.isInteger(value)).toBe(true);
  });

  it("keeps the table's readable columns in step", () => {
    let r = started();
    r = buzz(r, clock(3_400)).record;
    r = submitAnswer(r, clock(4_000), r.match.current.correct_answer).record;
    expect(summaryColumns(r, T0 + 4_000)).toMatchObject({
      status: "playing",
      round_number: 1,
      current_puzzle_id: r.match.schedule[0].id,
      round_started_at: new Date(T0).toISOString(),
      player_buzz_ms: 3_400,
    });
  });
});

describe("two real players in one match", () => {
  const players = { a: { session: "sa", name: "Emre_34" }, b: { session: "sb", name: "Can2004" }, since: T0 };
  const realMatch = (): MatchRecord => ({ id: "m2", ...newMatchRecord(buildSchedule(POOL, seeded(2)), "Can2004", players) });
  const begun = () => startRound(realMatch(), clock(0)).record;

  it("starts rounds without a bot plan: the opponent seat acts for itself", () => {
    expect(begun().round?.botPlan).toBeNull();
  });

  it("takes seat b's buzz and answer as the opponent side, timed by the server", () => {
    let r = begun();
    r = buzz(r, clock(3_400), "bot").record;
    const seenByA = toView(r, T0 + 3_500, "a");
    expect(seenByA.round).toMatchObject({ answering: "bot", bot: { kind: "answering", reveal: 2 } });
    r = submitAnswer(r, clock(4_000), r.match.current.correct_answer, "bot").record;
    expect(toView(r, T0 + 4_000, "a").round?.bot).toMatchObject({ kind: "correct", points: 800 });
  });

  it("refuses seat b's buzz while seat a answers, and the other way round (§7)", () => {
    let r = buzz(begun(), clock(1_000), "player").record;
    expect(buzz(r, clock(1_200), "bot").accepted).toBe(false);
    r = buzz(begun(), clock(1_000), "bot").record;
    expect(buzz(r, clock(1_200), "player").accepted).toBe(false);
  });

  it("never lets anyone act as the bot in a bot match", () => {
    expect(buzz(started(), clock(1_000), "bot").accepted).toBe(false);
  });

  it("shows seat b the match from their side: themselves as You, seat a by name", () => {
    let r = begun();
    r = buzz(r, clock(500), "bot").record;
    r = submitAnswer(r, clock(900), r.match.current.correct_answer, "bot").record;
    const b = toView(r, T0 + 900, "b");
    expect(b.opponentName).toBe("Emre_34");
    expect(b.round?.player).toMatchObject({ kind: "correct", points: 1000 });
    expect(b.round?.bot.kind).toBe("waiting");
    expect(b.channel).toBe("match:m2:b");
    const a = toView(r, T0 + 900, "a");
    expect(a.opponentName).toBe("Can2004");
    expect(a.round?.bot).toMatchObject({ kind: "correct", points: 1000 });
    expect(a.channel).toBe("match:m2");
  });

  it("mirrors finished rounds and the winner for seat b", () => {
    let r = begun();
    r = buzz(r, clock(500), "bot").record;
    r = submitAnswer(r, clock(900), r.match.current.correct_answer, "bot").record;
    r = catchUp(r, T0 + 16_000).record;
    const b = toView(r, T0 + 16_000, "b");
    expect(b.match.rounds[0]).toMatchObject({ player: { kind: "correct", points: 1000 }, bot: { kind: "no-buzz" } });
    expect(b.rematch).toBe("mutual");
  });

  it("gives the match to the player who stayed when the other is silent for 20 s", () => {
    const r = begun();
    const seen = { a: T0 + 19_000, b: T0 + 1_000 };
    expect(forfeitIfGone(r, T0 + 20_500, "a", seen).changed).toBe(false);
    const after = forfeitIfGone(r, T0 + 21_500, "a", seen).record;
    expect(after.match).toMatchObject({ status: "over", winner: "player" });
    expect(toView(after, T0 + 21_500, "a")).toMatchObject({ endedBecause: "opponent-left", match: { winner: "player" } });
    expect(toView(after, T0 + 21_500, "b")).toMatchObject({ endedBecause: "you-left", match: { winner: "bot" } });
  });

  it("counts presence from a little after the start for a seat that never checked in", () => {
    const at = T0 + START_GRACE_MS + LEAVE_AFTER_MS;
    expect(forfeitIfGone(begun(), at - 1, "b", { a: null, b: at }).changed).toBe(false);
    expect(forfeitIfGone(begun(), at + 1, "b", { a: null, b: at }).record.match.winner).toBe("bot");
  });

  it("does nothing in a bot match", () => {
    expect(forfeitIfGone(started(), T0 + 60_000, "a", { a: null, b: null }).changed).toBe(false);
  });
});

describe("presence and rematch in a real-player match", () => {
  const players = { a: { session: "sa", name: "Emre_34" }, b: { session: "sb", name: "Can2004" }, since: T0 };
  const realMatch = (): MatchRecord => ({ id: "m3", ...newMatchRecord(buildSchedule(POOL, seeded(2)), "Can2004", players) });
  const over = (): MatchRecord => ({ ...realMatch(), match: { ...realMatch().match, status: "over", winner: "player" } });

  it("tells a player their opponent is away after 5 s, with the 15 s reconnect window counting down (§28)", () => {
    const r = startRound(realMatch(), clock(0)).record;
    const seen = { a: T0 + 20_000, b: T0 + 16_000 };
    expect(toView(r, T0 + 20_000, "a", seen).opponentAway).toBeNull(); // b silent 4 s: fine
    expect(toView(r, T0 + 21_000, "a", seen).opponentAway).toEqual({ reconnectInMs: 15_000 });
    expect(toView(r, T0 + 30_000, "a", seen).opponentAway).toEqual({ reconnectInMs: 6_000 });
    expect(toView(r, T0 + 30_000, "b", { ...seen, a: T0 + 29_000 }).opponentAway).toBeNull(); // a is here
  });

  it("stops saying away once the opponent is back", () => {
    const r = startRound(realMatch(), clock(0)).record;
    expect(toView(r, T0 + 30_000, "a", { a: T0 + 30_000, b: T0 + 29_000 }).opponentAway).toBeNull();
  });

  it("does not offer a rematch before the match is over, nor in a bot match", () => {
    expect(requestRematch(realMatch(), T0, "a").changed).toBe(false);
    expect(requestRematch(started(), T0, "a").changed).toBe(false);
  });

  it("makes a rematch when both ask within 10 s, and shows each the other's offer", () => {
    const first = requestRematch(over(), T0, "a");
    expect(first).toMatchObject({ changed: true, bothAsked: false });
    expect(toView(first.record, T0 + 1_000, "b").rematchOffer).toEqual({ you: false, opponent: true, expiresInMs: 9_000 });
    expect(toView(first.record, T0 + 1_000, "a").rematchOffer).toEqual({ you: true, opponent: false, expiresInMs: 9_000 });
    const second = requestRematch(first.record, T0 + 6_000, "b");
    expect(second.bothAsked).toBe(true);
    const linked = linkRematch(second.record, "m-next").record;
    expect(toView(linked, T0 + 6_000, "a").rematchNext).toBe("m-next");
    expect(toView(linked, T0 + 6_000, "b").rematchNext).toBe("m-next");
    expect(linkRematch(linked, "m-other").changed).toBe(false); // the first link stands
  });

  it("lets an offer run out after 10 s", () => {
    const first = requestRematch(over(), T0, "a").record;
    expect(requestRematch(first, T0 + 10_001, "b").bothAsked).toBe(false);
    expect(toView(first, T0 + 10_001, "b").rematchOffer).toBeNull();
  });

  it("keeps the first time when a player asks twice", () => {
    const first = requestRematch(over(), T0, "a").record;
    expect(requestRematch(first, T0 + 3_000, "a").changed).toBe(false);
  });
});
