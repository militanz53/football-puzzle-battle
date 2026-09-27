import { expect as baseExpect, type Page } from "@playwright/test";
import {
  answer,
  buzz,
  currentPuzzle,
  db,
  expect,
  matchIdOnScreen,
  nextButton,
  scoreOf,
  test,
  waitForOpponent,
  waitForRoundResult,
} from "./helpers";

// Two real players against each other (GDD §13.1, §27, §28): two browsers, one match on
// the server. What one player does must show up on the other's screen at once, over
// the match's Realtime channels, with the server deciding everything.

/** What the opponent's corner of the scoreboard says right now ("Ready", "Answering…", "Correct · +1000"). */
const opponentStatus = (page: Page) => page.locator('[data-side="opponent"] p').last();

/** Live: the other browser should see a change well within this. */
const LIVE_MS = 3_000;

test("two players play one match against each other, see each other live, and can reconnect", async ({ browser }) => {
  test.setTimeout(3 * 60_000);
  const [ctxA, ctxB] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [a, b] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);

  let names: { a: string; b: string } = { a: "", b: "" };
  let id = "";

  await test.step("both press PLAY and land in the same match", async () => {
    await Promise.all([a.goto("/match"), b.goto("/match")]);
    const [aSees, bSees] = await Promise.all([waitForOpponent(a), waitForOpponent(b)]);
    id = await matchIdOnScreen(a);
    baseExpect(await matchIdOnScreen(b)).toBe(id);

    // Each sees the other under the other's name; which browser holds seat a is up to the queue.
    const { data } = await db.from("matches").select("opponent_kind, players").eq("id", id).single();
    baseExpect(data?.opponent_kind).toBe("human");
    const seatNames = [data!.players.a.name, data!.players.b.name].sort();
    baseExpect([aSees, bSees].sort()).toEqual(seatNames);
    baseExpect(aSees).not.toBe(bSees);
    names = { a: bSees, b: aSees }; // the name each player goes by, as the other sees it
    await Promise.all([
      a.screenshot({ path: "e2e/artifacts/screenshots/versus-01-a-start.png" }),
      b.screenshot({ path: "e2e/artifacts/screenshots/versus-01-b-start.png" }),
    ]);
  });

  const puzzle = await currentPuzzle(a);
  baseExpect((await currentPuzzle(b)).id).toBe(puzzle.id);

  await test.step("A buzzes: B sees A answering at once, without doing anything", async () => {
    await expect(opponentStatus(b)).toHaveText("Ready");
    await buzz(a);
    await expect(opponentStatus(b)).toHaveText("Answering…", { timeout: LIVE_MS });
    await expect(b.getByText(`Paused · ${names.a} is answering`)).toBeVisible({ timeout: LIVE_MS });
    await expect(b.getByRole("button", { name: /^Buzz/ })).toBeDisabled(); // §7: answering is exclusive
    await b.screenshot({ path: "e2e/artifacts/screenshots/versus-02-b-sees-a-answering.png" });
  });

  await test.step("A answers correctly: B sees the result at once", async () => {
    await answer(a, puzzle.correct_answer);
    await expect(opponentStatus(b)).toHaveText(/^Correct · \+\d+$/, { timeout: LIVE_MS });
    // The totals change when the round ends (checked below); the status line shows the points now.
    await b.screenshot({ path: "e2e/artifacts/screenshots/versus-03-b-sees-a-correct.png" });
  });

  await test.step("B buzzes: A sees B answering at once", async () => {
    await buzz(b);
    await expect(opponentStatus(a)).toHaveText("Answering…", { timeout: LIVE_MS });
    await expect(a.getByText(`Paused · ${names.b} is answering`)).toBeVisible({ timeout: LIVE_MS });
    await a.screenshot({ path: "e2e/artifacts/screenshots/versus-04-a-sees-b-answering.png" });
  });

  await test.step("B answers wrongly: the round ends for both, the same result from each side", async () => {
    await answer(b, "Definitely Not A Footballer");
    await Promise.all([waitForRoundResult(a), waitForRoundResult(b)]);
    await expect(a.getByRole("heading", { name: "Correct!", exact: true })).toBeVisible();
    await expect(b.getByRole("heading", { name: "Wrong!", exact: true })).toBeVisible();
    await expect(b.getByText("You answered “Definitely Not A Footballer”")).toBeVisible();
    const aPoints = await scoreOf(a, "player").textContent();
    await expect(scoreOf(b, "opponent")).toHaveText(aPoints!);
    await expect(scoreOf(a, "opponent")).toHaveText("0");
    await expect(scoreOf(b, "player")).toHaveText("0");
    await expect(a.locator('[data-side="opponent"]')).toContainText(names.b);
    await expect(b.locator('[data-side="opponent"]')).toContainText(names.a);
    await expect(a.getByText(`+${aPoints}`, { exact: true })).toBeVisible(); // the count-up has finished (~0.7 s)
    await Promise.all([
      a.screenshot({ path: "e2e/artifacts/screenshots/versus-05-a-result.png" }),
      b.screenshot({ path: "e2e/artifacts/screenshots/versus-05-b-result.png" }),
    ]);
  });

  await test.step("both move on to round 2 together", async () => {
    await expect(a.getByText(/^Round 2\/5 · /)).toBeVisible({ timeout: 10_000 });
    await expect(b.getByText(/^Round 2\/5 · /)).toBeVisible({ timeout: 10_000 });
    baseExpect((await currentPuzzle(a)).id).toBe((await currentPuzzle(b)).id);
  });

  await test.step("B loses the connection: both are told, and B comes back into the running match (§28)", async () => {
    await ctxB.setOffline(true);
    await expect(b.getByText("Reconnecting…")).toBeVisible({ timeout: 8_000 });
    await expect(a.getByText(new RegExp(`^${names.b} reconnecting… \\d+s$`))).toBeVisible({ timeout: 10_000 });
    await Promise.all([
      a.screenshot({ path: "e2e/artifacts/screenshots/versus-06-a-opponent-reconnecting.png" }),
      b.screenshot({ path: "e2e/artifacts/screenshots/versus-06-b-reconnecting.png" }),
    ]);
    await ctxB.setOffline(false);
    await expect(b.getByText("Reconnecting…")).toBeHidden({ timeout: 10_000 });
    await expect(a.getByText(new RegExp(`^${names.b} reconnecting`))).toBeHidden({ timeout: 10_000 });
    const { data } = await db.from("matches").select("status").eq("id", id).single();
    baseExpect(data?.status).not.toBe("over");
  });

  await test.step("B reloads the page: they are put back into the same match", async () => {
    await b.reload();
    await expect.poll(() => matchIdOnScreen(b).catch(() => ""), { timeout: 15_000 }).toBe(id);
  });

  await test.step("B closes their browser: after 20 s of silence A wins, and is told why", async () => {
    await ctxB.close();
    await expect(a.getByRole("heading", { name: "Victory" })).toBeVisible({ timeout: 35_000 });
    await expect(a.getByText(`${names.b} left the match`)).toBeVisible();
    await a.screenshot({ path: "e2e/artifacts/screenshots/versus-07-a-wins-b-left.png" });
    const { data } = await db.from("matches").select("status, winner, ended").eq("id", id).single();
    baseExpect(data?.status).toBe("over");
    baseExpect(data?.ended?.reason).toBe("left");
  });

  await ctxA.close();
});

/** Plays a round fast: A buzzes and answers right, B buzzes and answers wrong, then on to the next. */
async function quickRound(a: Page, b: Page) {
  const puzzle = await currentPuzzle(a);
  await buzz(a);
  await answer(a, puzzle.correct_answer);
  await buzz(b);
  await answer(b, "Definitely Not A Footballer");
  await Promise.all([waitForRoundResult(a), waitForRoundResult(b)]);
  await nextButton(a).click(); // either player may move on; both follow
}

/** Plays a whole match fast; A wins every round. */
async function quickMatch(a: Page, b: Page) {
  for (let round = 1; round <= 5; round++) await quickRound(a, b);
  await expect(a.getByRole("heading", { name: "Victory" })).toBeVisible({ timeout: 10_000 });
  await expect(b.getByRole("heading", { name: "Defeat" })).toBeVisible({ timeout: 10_000 });
}

test("nicknames, a rematch both players accept, and a rematch nobody answers", async ({ browser }) => {
  test.setTimeout(4 * 60_000);
  const [ctxA, ctxB] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [a, b] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);

  await test.step("A picks a nickname on the menu; B leaves it empty", async () => {
    await Promise.all([a.goto("/"), b.goto("/")]);
    await a.getByLabel("Nickname").fill("Alpha_1");
    await a.getByLabel("Nickname").press("Enter");
    await expect(a.getByRole("status").filter({ hasText: "Nickname saved" })).toBeAttached();
    await a.screenshot({ path: "e2e/artifacts/screenshots/versus-nickname-menu.png" });
  });

  let firstMatch = "";
  await test.step("they meet under their names: A's chosen one, B's Player_XXXX", async () => {
    await Promise.all([a.getByRole("link", { name: "Quick Match" }).click(), b.getByRole("link", { name: "Quick Match" }).click()]);
    const [aSees, bSees] = await Promise.all([waitForOpponent(a), waitForOpponent(b)]);
    baseExpect(bSees).toBe("Alpha_1");
    baseExpect(aSees).toMatch(/^Player_\d{4}$/);
    firstMatch = await matchIdOnScreen(a);
    baseExpect(await matchIdOnScreen(b)).toBe(firstMatch);
  });

  await test.step("they finish the match", async () => quickMatch(a, b));

  let secondMatch = "";
  await test.step("A asks for a rematch, B sees it and accepts: a new match between the same two", async () => {
    await a.getByRole("button", { name: "Rematch" }).click();
    await expect(a.getByRole("button", { name: /^Waiting for / })).toBeDisabled();
    await expect(b.getByText("Alpha_1 wants a rematch!")).toBeVisible({ timeout: 5_000 });
    await b.screenshot({ path: "e2e/artifacts/screenshots/versus-rematch-offered.png" });
    await b.getByRole("button", { name: "Rematch" }).click();
    await expect(a.getByText(/^Round 1\/5 · /)).toBeVisible({ timeout: 10_000 });
    await expect(b.getByText(/^Round 1\/5 · /)).toBeVisible({ timeout: 10_000 });
    secondMatch = await matchIdOnScreen(a);
    baseExpect(secondMatch).not.toBe(firstMatch);
    baseExpect(await matchIdOnScreen(b)).toBe(secondMatch);
    await expect(b.locator('[data-side="opponent"]')).toContainText("Alpha_1");
    const { data } = await db.from("matches").select("rematch").eq("id", firstMatch).single();
    baseExpect(data?.rematch?.next).toBe(secondMatch);
  });

  await test.step("they finish the rematch", async () => quickMatch(a, b));

  await test.step("A asks again but B does not answer: A is told, then searches for a new opponent", async () => {
    await a.getByRole("button", { name: "Rematch" }).click();
    await expect(a.getByRole("button", { name: /^Waiting for / })).toBeVisible();
    await expect(a.getByText(/ left · finding a new opponent…$/)).toBeVisible({ timeout: 15_000 });
    await a.screenshot({ path: "e2e/artifacts/screenshots/versus-rematch-declined.png" });
    await expect(a.getByRole("heading", { name: "Finding an opponent…" })).toBeVisible({ timeout: 5_000 });
  });

  await Promise.all([ctxA.close(), ctxB.close()]);
});
