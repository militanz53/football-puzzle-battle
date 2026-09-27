import { describe, expect, it } from "vitest";
import { seeded } from "@/game/__fixtures__/seeded";
import { buildSchedule, ROUND_ORDER } from "@/game/match";
import type { Puzzle } from "@/game/types";
import { loadSnapshot } from "@/test/snapshot";
import { buzz, catchUp, type Clock, type MatchRecord, newMatchRecord, nextRound, startRound, submitAnswer } from "./service";
import { hideAnswer, summaryColumns, toView } from "./view";

// The server's match rules over a fake clock. The engine itself is tested in src/game.

const POOL = loadSnapshot();
const T0 = 1_750_000_000_000;
const loadPool = async () => POOL;

function freshMatch(seed = 1): MatchRecord {
  return { id: "m1", ...newMatchRecord(buildSchedule(POOL, seeded(seed))) };
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
    expect(record.round?.botPlan.buzzReveal).toBeGreaterThanOrEqual(2);
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
