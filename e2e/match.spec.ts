import type { Page } from "@playwright/test";
import type { PuzzleType } from "../src/game/types";
import {
  answer,
  buzz,
  currentPuzzle,
  expect,
  test,
  TYPE_LABEL,
  waitForClue,
  waitForNextRound,
  waitForRoundResult,
} from "./helpers";

// §5 round order: every match plays one puzzle of each type in this order.
const ROUND_ORDER: PuzzleType[] = ["goal_map", "photo_reveal", "missing_xi", "career_journey", "teammate_web"];

type Strategy = "buzz-first-correct" | "wrong-answer" | "no-buzz" | "late-buzz-correct" | "answer-timeout";

/** One strategy per round, in round order, with what the round result must show. */
const PLAN: { strategy: Strategy; headline: string; points: number }[] = [
  { strategy: "buzz-first-correct", headline: "Correct!", points: 1000 }, // §8: reveal 1
  { strategy: "wrong-answer", headline: "Wrong!", points: 0 },
  { strategy: "no-buzz", headline: "No answer", points: 0 },
  { strategy: "late-buzz-correct", headline: "Correct!", points: 200 }, // §8: reveal 5
  { strategy: "answer-timeout", headline: "Time's up", points: 0 }, // §7: ~8 s to answer
];

async function openMatchFromMenu(page: Page, shot: (name: string) => Promise<void>) {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Play" })).toBeVisible();
  await shot("main-menu");
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page).toHaveURL(/\/match$/);
}

async function playRound(page: Page, round: number, strategy: Strategy, shot: (name: string) => Promise<void>) {
  const puzzle = await currentPuzzle(page);
  await expect(page.getByText(`Round ${round}/5 · ${TYPE_LABEL[puzzle.type]}`)).toBeVisible();
  await shot(`round-${round}-${puzzle.type}-reveal-1`);

  switch (strategy) {
    case "buzz-first-correct":
      await buzz(page);
      await answer(page, puzzle.correct_answer);
      break;
    case "wrong-answer":
      await buzz(page);
      await answer(page, "Definitely Not A Footballer");
      break;
    case "no-buzz":
      break; // let the 15 s window run out
    case "late-buzz-correct":
      await waitForClue(page, 5);
      await shot(`round-${round}-${puzzle.type}-reveal-5`);
      await buzz(page);
      await answer(page, puzzle.correct_answer);
      break;
    case "answer-timeout":
      await buzz(page);
      await shot(`round-${round}-${puzzle.type}-answering`);
      break; // type nothing; the 8 s answer window expires
  }

  const next = await waitForRoundResult(page);
  await shot(`round-${round}-result`);
  return { puzzle, next };
}

test.describe("MVP 0.1 match against the bot", () => {
  test("full match: five strategies, match result, rematch", async ({ page, shot, log }) => {
    await openMatchFromMenu(page, shot);

    const types: PuzzleType[] = [];
    let expectedTotal = 0;
    let next = "";

    for (const [i, { strategy, headline, points }] of PLAN.entries()) {
      const round = i + 1;
      const result = await test.step(`round ${round}: ${strategy}`, () => playRound(page, round, strategy, shot));
      types.push(result.puzzle.type);
      next = result.next;
      expectedTotal += points;

      await expect(page.getByRole("heading", { name: headline, exact: true })).toBeVisible();
      await expect(page.getByText(`+${points}`, { exact: true })).toBeVisible();
      await expect(page.getByText(result.puzzle.correct_answer, { exact: true }).first()).toBeVisible();
      if (strategy === "wrong-answer") await expect(page.getByText("You answered “Definitely Not A Footballer”")).toBeVisible();
      if (strategy === "no-buzz") await expect(page.getByText("You didn't buzz this round")).toBeVisible();
      if (round < 5) await waitForNextRound(page);
    }

    await test.step("the five rounds covered the five puzzle types in §5 order", async () => {
      expect(types).toEqual(ROUND_ORDER);
    });

    await test.step("match result", async () => {
      // A random bot can draw level with us; if so, win the Sudden Death to finish.
      let suddenDeathRounds = 0;
      while (next === "Sudden death") {
        suddenDeathRounds += 1;
        await waitForNextRound(page);
        const puzzle = await currentPuzzle(page);
        await expect(page.getByText(`Sudden death · ${TYPE_LABEL[puzzle.type]}`)).toBeVisible();
        await shot(`sudden-death-${suddenDeathRounds}`);
        await buzz(page);
        await answer(page, puzzle.correct_answer);
        next = await waitForRoundResult(page);
      }
      expect(next).toBe("See match result");
      await waitForNextRound(page);

      const title = page.getByRole("heading", { name: /^(Victory|Defeat)$/ });
      await expect(title).toBeVisible();
      await expect(page.getByText("Match result")).toBeVisible();
      // Sudden Death never adds points (§12.1), so the total is exactly the planned rounds.
      await expect(scoreOf(page, "You")).toHaveText(String(expectedTotal));
      await expect(scoreOf(page, "Bot")).toHaveText(/^\d+$/);
      await expect(stat(page, "Correct answers")).toHaveText("2/5");
      await expect(stat(page, "Average buzz")).toHaveText(/^\d+\.\ds$/);
      await expect(stat(page, "Best round")).toHaveText("Goal Map +1000");
      await expect(stat(page, "Fastest answer")).toHaveText(/^\d+\.\ds$/);
      await shot("match-result");
    });

    await test.step("rematch starts a new match", async () => {
      await page.getByRole("button", { name: "Rematch" }).click();
      await expect(page.getByText("Round 1/5 · Goal Map")).toBeVisible();
      await expect(page.locator("[data-puzzle-type]")).toHaveAttribute("data-puzzle-type", "goal_map");
      await expect(scoreOf(page, "You")).toHaveText("0");
      await expect(scoreOf(page, "Bot")).toHaveText("0");
      await expect(page.getByRole("button", { name: /^Buzz/ })).toBeEnabled();
      await shot("rematch-round-1");
    });

    expect.soft(log.filter((e) => e.kind === "pageerror"), "uncaught page errors").toEqual([]);
  });

  test("tied match goes to sudden death", async ({ page, shot, log }) => {
    // The bot answers 70% correctly, so a 0-0 match cannot happen by chance in a test.
    // In the browser, Math.random calls made by planBotTurn (bot.ts) return 0.99, so every
    // bot plan is "buzz at reveal 4, answer wrong"; the app itself is unchanged. Only the
    // bot's draws are pinned: a constant Math.random everywhere breaks React's click
    // handling. This relies on dev-server function names (the webServer runs `next dev`);
    // the "Wrong after 4 clues" checks below fail loudly if it ever stops working.
    await page.addInitScript(() => {
      const random = Math.random.bind(Math);
      Math.random = () => (new Error().stack?.includes("planBotTurn") ? 0.99 : random());
    });
    await openMatchFromMenu(page, shot);

    let next = "";
    for (let round = 1; round <= 5; round++) {
      await test.step(`round ${round}: nobody scores`, async () => {
        const puzzle = await currentPuzzle(page);
        await expect(page.getByText(`Round ${round}/5 · ${TYPE_LABEL[puzzle.type]}`)).toBeVisible();
        // Regular rounds show what each reveal is worth under the timer (§8).
        if (round === 1) await expect(page.getByText("1000", { exact: true })).toBeVisible();
        next = await waitForRoundResult(page);
        await expect(page.getByRole("heading", { name: "No answer" })).toBeVisible();
        await expect(page.getByText(/^Wrong after 4 clues/)).toBeVisible();
        if (round === 5) await shot("round-5-result-level");
        if (round < 5) await waitForNextRound(page);
      });
    }

    await test.step("0-0 after five rounds triggers Sudden Death (§12.1)", async () => {
      expect(next).toBe("Sudden death");
      await waitForNextRound(page);
      const puzzle = await currentPuzzle(page);
      await expect(page.getByText("Sudden death", { exact: true })).toBeVisible();
      await expect(page.getByText(`Sudden death · ${TYPE_LABEL[puzzle.type]}`)).toBeVisible();
      await expect(page.getByText("First correct answer wins")).toBeVisible();
      // §12.1: Sudden Death is worth no points, so no point values anywhere on screen.
      for (const pts of ["1000", "800", "600", "400", "200"]) {
        await expect(page.getByText(pts, { exact: true })).toHaveCount(0);
      }
      await expect(page.getByText(/\+\d/)).toHaveCount(0);
      await shot(`sudden-death-${puzzle.type}`);

      await buzz(page);
      await answer(page, puzzle.correct_answer);
      await waitForRoundResult(page);
      await expect(page.getByText("You win the match!")).toBeVisible();
      await shot("sudden-death-result");
    });

    await test.step("match result says it was decided in sudden death", async () => {
      await waitForNextRound(page);
      await expect(page.getByRole("heading", { name: "Victory" })).toBeVisible();
      await expect(page.getByText("Decided in sudden death")).toBeVisible();
      await expect(scoreOf(page, "You")).toHaveText("0");
      await expect(scoreOf(page, "Bot")).toHaveText("0");
      await expect(stat(page, "Correct answers")).toHaveText("0/5");
      await shot("match-result");
    });

    expect.soft(log.filter((e) => e.kind === "pageerror"), "uncaught page errors").toEqual([]);
  });
});

/** The big total under "You" / "Bot" on the scoreboard or the match result. */
function scoreOf(page: Page, who: "You" | "Bot") {
  return page.getByText(who, { exact: true }).first().locator("xpath=following-sibling::p[1]");
}

function stat(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]");
}
