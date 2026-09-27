import { describe, expect, it } from "vitest";
import { careerPuzzle } from "./__fixtures__/careerPuzzle";
import type { BotPlan } from "./bot";
import { revealStage } from "./round";
import { msUntilNextChange, replayRound, type RoundTimeline, STEP_MS, type TimelineEvent } from "./timeline";

// Server-side round logic: the engine replayed over server-received times.
// careerPuzzle: 3 s reveals, answer "Zlatan Ibrahimović" (alias "Ibra").

const idleBot: BotPlan = { buzzReveal: 5, buzzAtMs: 99_000, answerDelayMs: 2000, correct: true };
const timeline = (events: TimelineEvent[] = [], botPlan: BotPlan = idleBot): RoundTimeline => ({ startedAt: 1_000_000, botPlan, events });
const at = (ms: number, events: TimelineEvent[] = [], bot?: BotPlan, suddenDeath = false) =>
  replayRound(careerPuzzle, timeline(events, bot), ms, suddenDeath);
const buzz = (ms: number): TimelineEvent => ({ at: ms, type: "buzz" });
const submit = (ms: number, text: string): TimelineEvent => ({ at: ms, type: "submit", text });

describe("reveal timing (§6.1) on the server clock", () => {
  it("opens a clue every 3 s", () => {
    expect([0, 2999, 3000, 5999, 6000, 9000, 12000, 14999].map((ms) => revealStage(at(ms).state.round))).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
  });

  it("closes the round after 15 s with no buzz: 0 points each", () => {
    const { state, finishedAtMs } = at(20_000);
    expect(finishedAtMs).toBe(15_000);
    expect(state.round.player).toEqual({ kind: "no-buzz" });
    expect(state.round.bot).toEqual({ kind: "no-buzz" });
  });

  it("reads the same however late the server is asked", () => {
    expect(at(15_000)).toEqual(at(3_600_000));
  });
});

describe("scoring by server receive time (§8)", () => {
  it.each([
    [500, 1000],
    [3500, 800],
    [6500, 600],
    [9500, 400],
    [12500, 200],
  ])("a buzz received at %i ms answered correctly scores %i", (buzzAt, points) => {
    const { state } = at(30_000, [buzz(buzzAt), submit(buzzAt + 1500, "Ibra")]);
    expect(state.round.player).toMatchObject({ kind: "correct", points });
    expect(state.playerBuzzMs).toBe(buzzAt);
  });

  it("scores 0 for a wrong answer and keeps what was typed", () => {
    const { state } = at(30_000, [buzz(500), submit(900, "Messi")]);
    expect(state.round.player).toEqual({ kind: "wrong", reveal: 1, answer: "Messi", timedOut: false });
  });

  it("gives up after the 8 s answer window (§7)", () => {
    const answering = at(8_400, [buzz(500)]).state.round;
    expect(answering.player.kind).toBe("answering");
    const late = at(8_600, [buzz(500), submit(8_550, "Ibra")]).state.round;
    expect(late.player).toMatchObject({ kind: "wrong", timedOut: true });
  });

  it("freezes the reveal clock while the player answers, then resumes it", () => {
    // Buzz at 1 s, wrong at 4 s: the clock stood at 1 s during those 3 s.
    const { state } = at(6_000, [buzz(1_000), submit(4_000, "Messi")]);
    expect(state.round.clockMs).toBe(3_000);
    expect(revealStage(state.round)).toBe(2);
  });
});

describe("buzz order (§7: answering is exclusive)", () => {
  const botAt2s: BotPlan = { buzzReveal: 1, buzzAtMs: 2000, answerDelayMs: 2000, correct: false };

  it("ignores a player buzz that arrives while the bot is answering", () => {
    const { state } = at(3_000, [buzz(2_500)], botAt2s);
    expect(state.round.answering).toBe("bot");
    expect(state.round.player.kind).toBe("waiting");
    expect(state.playerBuzzMs).toBeNull();
  });

  it("lets the player buzz once the bot is done", () => {
    const { state } = at(5_000, [buzz(2_500), buzz(4_500)], botAt2s);
    expect(state.round.bot).toMatchObject({ kind: "wrong" });
    expect(state.round.player).toEqual({ kind: "answering", reveal: 1 });
    // Reveal clock time: it stood at 2 s while the bot answered (2-4 s), then ran 0.5 s more.
    expect(state.playerBuzzMs).toBe(2_500);
  });

  it("holds the bot back while the player, who buzzed first, answers", () => {
    const { state } = at(3_000, [buzz(1_500)], botAt2s);
    expect(state.round.answering).toBe("player");
    expect(state.round.bot.kind).toBe("waiting");
  });

  it("records the bot's buzz and result from its server-side plan (§29.1)", () => {
    const { state } = at(10_000, [], { buzzReveal: 2, buzzAtMs: 4_000, answerDelayMs: 1_500, correct: true });
    expect(state.round.bot).toEqual({ kind: "correct", reveal: 2, points: 800 });
    expect(state.botBuzzMs).toBe(4_000);
  });
});

describe("when a round finishes", () => {
  it("ends a regular round when both sides are done, ignoring later actions", () => {
    const bot: BotPlan = { buzzReveal: 2, buzzAtMs: 4_000, answerDelayMs: 1_000, correct: false };
    const { state, finishedAtMs } = at(60_000, [buzz(500), submit(1_000, "Ibra"), buzz(20_000)], bot);
    // The clock stood at 0.5 s while the player answered (0.5-1 s), so the bot reaches
    // clock 4 s at 4.5 s, and answers 1 s later.
    expect(finishedAtMs).toBe(5_500);
    expect(state.round.player).toMatchObject({ kind: "correct", points: 1000 });
  });

  it("ends a Sudden Death round at the first correct answer (§12.1)", () => {
    const { state, finishedAtMs } = at(60_000, [buzz(500), submit(1_200, "Ibra")], undefined, true);
    expect(finishedAtMs).toBe(1_200);
    expect(state.firstCorrect).toBe("player");
    expect(state.round.bot.kind).toBe("waiting");
  });
});

describe("msUntilNextChange", () => {
  it("points at the bot's buzz", () => {
    const bot: BotPlan = { buzzReveal: 2, buzzAtMs: 4_000, answerDelayMs: 1_000, correct: false };
    const wait = msUntilNextChange(careerPuzzle, timeline([], bot), 1_000, false)!;
    expect(wait).toBeGreaterThanOrEqual(3_000);
    expect(wait).toBeLessThanOrEqual(3_000 + STEP_MS);
  });

  it("points at the end of the answer window while the player answers", () => {
    const wait = msUntilNextChange(careerPuzzle, timeline([buzz(500)]), 2_500, false)!;
    expect(Math.abs(wait - 6_000)).toBeLessThanOrEqual(STEP_MS);
  });

  it("points at the end of the reveal window when nobody will buzz", () => {
    const wait = msUntilNextChange(careerPuzzle, timeline(), 10_000, false)!;
    expect(Math.abs(wait - 5_000)).toBeLessThanOrEqual(STEP_MS);
  });

  it("is null once the round has finished", () => {
    expect(msUntilNextChange(careerPuzzle, timeline(), 16_000, false)).toBeNull();
  });
});
