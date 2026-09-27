import { expect as baseExpect, type Browser } from "@playwright/test";
import { db, expect, test } from "./helpers";

// The Ranked leaderboard (GDD §14): public, ordered by rating, your own line marked.
// Accounts made here (it-…@example.com) are deleted afterwards.

const PASSWORD = "e2e-password-123";
const made: { username: string; userId: string; email: string }[] = [];

test.afterAll(async () => {
  for (const { userId } of made) {
      const { error } = await db.auth.admin.deleteUser(userId);
      if (error) throw new Error(`Could not delete test account: ${error.message}`);
    }
});

/** A signed-in browser whose account has played `played` ranked matches at `rating`. */
async function player(browser: Browser, rating: number, played: number) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const username = `e2e_${crypto.randomUUID().slice(0, 8)}`;
  const email = `it-${username}@example.com`;
  await page.goto("/account?next=/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page).toHaveURL("/");
  const { data } = await db
    .from("profiles")
    .update({ rating, matches_played: played, matches_won: played })
    .ilike("username", username)
    .select("user_id")
    .single();
  made.push({ username, userId: data!.user_id, email });
  return { context, page, username, userId: data!.user_id as string, email };
}

test("open to everyone, ordered by rating, without a single private field", async ({ page, browser, shot }) => {
  // Two ranked players far above anyone real, so they are #1 and #2.
  const top = await player(browser, 9500, 5);
  const second = await player(browser, 9400, 2);
  await top.context.close();
  await second.context.close();

  await page.goto("/");
  await page.getByRole("link", { name: "Leaderboard" }).click();
  await expect(page).toHaveURL("/leaderboard");
  await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();

  const rows = page.getByRole("list", { name: "Leaderboard" }).locator("li");
  await expect(rows.nth(0)).toHaveAttribute("data-username", top.username);
  await expect(rows.nth(0)).toContainText("9500");
  await expect(rows.nth(0)).toContainText("GOAT");
  await expect(rows.nth(1)).toHaveAttribute("data-username", second.username);
  const ratings = await rows.evaluateAll((items) => items.map((li) => Number(li.lastElementChild?.textContent)));
  baseExpect(ratings).toEqual([...ratings].sort((a, b) => b - a)); // highest first, all the way down
  const positions = await rows.evaluateAll((items) => items.map((li) => Number(li.getAttribute("data-position"))));
  baseExpect(positions[0]).toBe(1);

  // Signed out: nobody's line is marked, and there is a way in.
  await expect(page.locator("[data-you]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in to see your rank" })).toHaveAttribute("href", "/account?next=/leaderboard");
  await shot("leaderboard-signed-out");

  // Nothing private anywhere in what the browser received.
  const html = await page.content();
  for (const secret of [top.email, second.email, top.userId, second.userId]) baseExpect(html).not.toContain(secret);
});

test("signed in: your own line is marked", async ({ browser }) => {
  const you = await player(browser, 9600, 3);
  await you.page.goto("/leaderboard");
  const mine = you.page.locator("[data-you]");
  await expect(mine).toHaveCount(1);
  await expect(mine).toHaveAttribute("data-username", you.username);
  await expect(mine).toHaveAttribute("data-position", "1");
  await expect(mine).toContainText("You");
  await expect(mine).toHaveAttribute("aria-current", "true");
  await you.page.screenshot({ path: "e2e/artifacts/screenshots/leaderboard-you.png", fullPage: true });
  await you.context.close();
});

test("signed in but unranked: not on the board, and told how to get there", async ({ browser }) => {
  const you = await player(browser, 1200, 0);
  await you.page.goto("/leaderboard");
  await expect(you.page.locator(`[data-username="${you.username}"]`)).toHaveCount(0);
  await expect(you.page.getByText("You are not ranked yet.")).toBeVisible();
  await expect(you.page.getByRole("link", { name: "Play a ranked match" })).toHaveAttribute("href", "/ranked");
  await you.context.close();
});
