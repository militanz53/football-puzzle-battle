import { expect as baseExpect, type Browser, type Page } from "@playwright/test";
import { db, expect, matchIdOnScreen, MATCHMAKING_TIMEOUT, test, waitForOpponent } from "./helpers";

// Ranked (GDD §13.5, §14): accounts, the ranked lane of the queue, ratings. Accounts
// made here (it-…@example.com) are deleted afterwards, and their profiles with them.

const PASSWORD = "e2e-password-123";
const made: string[] = [];

test.afterAll(async () => {
  for (const email of made) {
    const { data } = await db.from("profiles").select("user_id").ilike("username", email.split("@")[0].slice(3));
    for (const row of data ?? []) await db.auth.admin.deleteUser(row.user_id);
  }
});

/** A fresh username (≤ 16 characters) and its email. */
function newAccount() {
  const username = `e2e_${crypto.randomUUID().slice(0, 8)}`;
  const email = `it-${username}@example.com`;
  made.push(email);
  return { username, email };
}

async function signUp(page: Page, account: { username: string; email: string }) {
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).last().click();
}

/** A browser with a new ranked account, signed in, on the menu. */
async function signedInPlayer(browser: Browser, rating?: number) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const account = newAccount();
  await page.goto("/account?next=/");
  await signUp(page, account);
  await expect(page).toHaveURL("/");
  if (rating !== undefined) {
    const { error } = await db.from("profiles").update({ rating }).ilike("username", account.username);
    if (error) throw new Error(error.message);
  }
  return { context, page, ...account };
}

test("sign up from RANKED, see the account on the menu, sign out and back in", async ({ page, shot }) => {
  const account = newAccount();

  await test.step("RANKED without an account opens the account screen", async () => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await page.getByRole("link", { name: "Ranked" }).click();
    await expect(page).toHaveURL("/account?next=/ranked");
    await expect(page.getByRole("heading", { name: "Play for your rank" })).toBeVisible();
    await shot("account-screen");
  });

  await test.step("a bad password is refused before anything is created", async () => {
    await page.getByLabel("Username").fill(account.username);
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill("short");
    // The browser's own minlength check would stop the form; skip it to see the server's.
    await page.locator("form").evaluate((form) => form.setAttribute("novalidate", ""));
    await page.getByRole("button", { name: "Create account" }).last().click();
    await expect(page.locator("#auth-error")).toHaveText("Password: at least 8 characters.");
  });

  await test.step("creating the account signs in and goes on to the ranked search", async () => {
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).last().click();
    await expect(page).toHaveURL("/ranked");
    await expect(page.getByText("Ranked · 5 rounds")).toBeVisible();
    await shot("ranked-search");
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page).toHaveURL("/");
  });

  await test.step("the menu shows username, tier and rating", async () => {
    const chip = page.locator("[data-account]");
    await expect(chip).toContainText(account.username);
    await expect(chip).toContainText("Pro · 1200");
    await expect(page.getByLabel("Nickname")).toBeVisible(); // Quick Match's nickname is still there
    await shot("menu-signed-in");
    const { data } = await db.from("profiles").select("rating, matches_played").ilike("username", account.username).single();
    baseExpect(data).toEqual({ rating: 1200, matches_played: 0 });
  });

  await test.step("sign out", async () => {
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.locator("[data-account]")).toHaveCount(0);
    await page.goto("/ranked");
    await expect(page).toHaveURL("/account?next=/ranked"); // signed out again
  });

  await test.step("a wrong password is refused; the right one signs back in", async () => {
    await page.goto("/account?tab=signin");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).last().click();
    await expect(page.locator("#auth-error")).toHaveText("Wrong email or password.");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).last().click();
    await expect(page).toHaveURL("/");
    await expect(page.locator("[data-account]")).toContainText(account.username);
  });

  await test.step("the username is taken for anyone else, whatever the case", async () => {
    const other = await page.context().browser()!.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("/account");
    await signUp(otherPage, { username: account.username.toUpperCase(), email: newAccount().email });
    await expect(otherPage.locator("#auth-error")).toHaveText("That username is taken.");
    await other.close();
  });
});

test("Ranked alone: no bot, 'No opponents found', while Quick Match still gets its opponent", async ({ browser }) => {
  test.setTimeout(2 * 60_000);
  const ranked = await signedInPlayer(browser);
  const quickContext = await browser.newContext();
  const quick = await quickContext.newPage();

  // Both search at the same moment, in different lanes.
  await Promise.all([ranked.page.goto("/ranked"), quick.goto("/match")]);

  const [, opponent] = await Promise.all([
    expect(ranked.page.getByRole("heading", { name: "No opponents found" })).toBeVisible({ timeout: MATCHMAKING_TIMEOUT }),
    waitForOpponent(quick),
  ]);
  await ranked.page.screenshot({ path: "e2e/artifacts/screenshots/ranked-no-opponent.png" });
  const quickMatch = await matchIdOnScreen(quick);
  const { data } = await db.from("matches").select("opponent_kind, mode").eq("id", quickMatch).single();
  baseExpect(data).toEqual({ opponent_kind: "bot", mode: "quick" }); // Quick Match as before
  baseExpect(opponent).not.toBe(ranked.username);

  // The ranked entry timed out with no match: nobody played the bot in Ranked.
  const { data: profile } = await db.from("profiles").select("user_id").ilike("username", ranked.username).single();
  const { data: rows } = await db.from("match_queue").select("status, match_id, mode").eq("user_id", profile!.user_id);
  baseExpect(rows).toEqual([{ status: "timed_out", match_id: null, mode: "ranked" }]);

  await ranked.page.getByRole("button", { name: "Try again" }).click();
  await expect(ranked.page.getByRole("heading", { name: "Finding an opponent…" })).toBeVisible();
  // Leave the queue properly, so the next test's players cannot be paired with this entry.
  await ranked.page.getByRole("link", { name: "Cancel" }).click();
  await expect(ranked.page).toHaveURL("/");
  await Promise.all([ranked.context.close(), quickContext.close()]);
});

test("two ranked players: usernames and ratings on screen, Elo after the match, rank up", async ({ browser }) => {
  test.setTimeout(3 * 60_000);
  // 1390 vs 1410: the winner gains 17, and 1390 → 1407 crosses from PRO into ELITE.
  const [a, b] = await Promise.all([signedInPlayer(browser, 1390), signedInPlayer(browser, 1410)]);

  let id = "";
  await test.step("both press RANKED and meet each other by username and rating", async () => {
    await Promise.all([a.page.getByRole("link", { name: "Ranked" }).click(), b.page.getByRole("link", { name: "Ranked" }).click()]);
    // "Opponent found" shows for 1.4 s on each screen: check each while it is up.
    const found = async (page: Page, opponent: string, line: string) => {
      await expect(page.getByText("Opponent found")).toBeVisible({ timeout: MATCHMAKING_TIMEOUT });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(opponent, { timeout: 1_000 });
      await expect(page.getByText(line)).toBeVisible({ timeout: 1_000 });
    };
    await Promise.all([found(a.page, b.username, "Elite · 1410"), found(b.page, a.username, "Pro · 1390")]);

    await expect(a.page.locator("[data-puzzle-id]")).toBeVisible({ timeout: 10_000 });
    id = await matchIdOnScreen(a.page);
    baseExpect(await matchIdOnScreen(b.page)).toBe(id);
    await expect(a.page.locator('[data-side="player"]')).toContainText(`${a.username} · 1390`);
    await expect(a.page.locator('[data-side="opponent"]')).toContainText(`${b.username} · 1410`);
    await a.page.screenshot({ path: "e2e/artifacts/screenshots/ranked-scoreboard.png" });
    const { data } = await db.from("matches").select("mode, opponent_kind").eq("id", id).single();
    baseExpect(data).toEqual({ mode: "ranked", opponent_kind: "human" });
  });

  await test.step("B leaves; A wins, gains 17 and ranks up to ELITE", async () => {
    await b.context.close();
    await expect(a.page.getByRole("heading", { name: "Victory" })).toBeVisible({ timeout: 35_000 });
    const change = a.page.locator("[data-rating-change]");
    await expect(change).toContainText("Rank up!");
    await expect(change).toContainText("Pro → Elite");
    await expect(change).toContainText("1390 → 1407 (+17)");
    await expect(a.page.getByRole("button", { name: "Play again" })).toBeVisible();
    await a.page.screenshot({ path: "e2e/artifacts/screenshots/ranked-rank-up.png" });
  });

  await test.step("both profiles were updated once", async () => {
    const rows = async (username: string) =>
      (await db.from("profiles").select("rating, matches_played, matches_won, matches_lost").ilike("username", username).single()).data;
    baseExpect(await rows(a.username)).toEqual({ rating: 1407, matches_played: 1, matches_won: 1, matches_lost: 0 });
    baseExpect(await rows(b.username)).toEqual({ rating: 1393, matches_played: 1, matches_won: 0, matches_lost: 1 });
  });

  await test.step("the menu shows the new tier and rating", async () => {
    await a.page.goto("/");
    await expect(a.page.locator("[data-account]")).toContainText("Elite · 1407");
  });

  await a.context.close();
});
