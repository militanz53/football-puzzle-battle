import { expect as baseExpect, type Browser } from "@playwright/test";
import { db, expect, matchIdOnScreen, test } from "./helpers";

// Friends and friendly challenges (GDD §13.2) between Ranked accounts. Accounts made
// here (it-…@example.com) are deleted afterwards, with everything that hangs off them.

const PASSWORD = "e2e-password-123";
const made: string[] = [];

test.afterAll(async () => {
  for (const username of made) {
    const { data } = await db.from("profiles").select("user_id").ilike("username", username);
    for (const row of data ?? []) {
      const { error } = await db.auth.admin.deleteUser(row.user_id);
      if (error) throw new Error(`Could not delete test account: ${error.message}`);
    }
  }
});

/** A browser with a new account, signed in, on the menu. */
async function player(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const username = `e2e_${crypto.randomUUID().slice(0, 8)}`;
  made.push(username);
  await page.goto("/account?next=/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(`it-${username}@example.com`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).last().click();
  await expect(page).toHaveURL("/");
  return { context, page, username };
}

const profile = async (username: string) =>
  (await db.from("profiles").select("rating, matches_played").ilike("username", username).single()).data;

test("FRIENDS needs an account", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Friends" }).click();
  await expect(page).toHaveURL("/account?next=/friends");
});

test("add a friend, decline and accept, challenge them live, play a friendly match with no rating change", async ({ browser }) => {
  test.setTimeout(4 * 60_000);
  const [a, b, c] = await Promise.all([player(browser), player(browser), player(browser)]);

  await test.step("A finds B by username and sends a request; B declines it", async () => {
    await a.page.getByRole("link", { name: "Friends" }).click();
    await expect(a.page).toHaveURL("/friends");
    await a.page.getByLabel("Search by username").fill(b.username);
    const row = a.page.getByLabel("Search results").locator(`[data-player="${b.username}"]`);
    await row.getByRole("button", { name: "Add Friend" }).click();
    await expect(a.page.getByText(`Friend request sent to ${b.username}.`)).toBeVisible();
    await expect(row).toContainText("Pending");
    await a.page.screenshot({ path: "e2e/artifacts/screenshots/friends-request-sent.png" });

    await b.page.goto("/friends");
    const request = b.page.locator(`[data-player="${a.username}"]`);
    await expect(request).toContainText("Pro · 1200");
    await request.getByRole("button", { name: "Decline" }).click();
    await expect(b.page.getByText("Request declined.")).toBeVisible();
    await expect(b.page.getByRole("heading", { name: "Friend requests" })).toHaveCount(0);
  });

  await test.step("A asks again; B accepts: both have each other in their lists", async () => {
    await a.page.reload();
    await a.page.getByLabel("Search by username").fill(b.username);
    await a.page.getByLabel("Search results").getByRole("button", { name: "Add Friend" }).click();
    await expect(a.page.getByText(`Friend request sent to ${b.username}.`)).toBeVisible();
    await b.page.reload();
    await b.page.locator(`[data-player="${a.username}"]`).getByRole("button", { name: "Accept" }).click();
    await expect(b.page.getByText("Friend added.")).toBeVisible();
    await expect(b.page.getByLabel("Friends", { exact: true }).locator(`[data-player="${a.username}"]`)).toBeVisible();
    await a.page.reload();
    const friend = a.page.getByLabel("Friends", { exact: true }).locator(`[data-player="${b.username}"]`);
    await expect(friend).toContainText("Pro · 1200");
    await expect(friend.getByRole("button", { name: "Challenge" })).toBeVisible();
    await a.page.screenshot({ path: "e2e/artifacts/screenshots/friends-list.png" });
  });

  const challenge = async () => {
    await a.page.getByLabel("Friends", { exact: true }).locator(`[data-player="${b.username}"]`).getByRole("button", { name: "Challenge" }).click();
    await expect(a.page.getByText(`Waiting for ${b.username}…`)).toBeVisible();
  };
  const invite = (page: typeof b.page) => page.locator("[data-invite]");

  await test.step("a challenge reaches B live on the menu, not C; B declines, A is told", async () => {
    await Promise.all([b.page.goto("/"), c.page.goto("/")]);
    await expect(b.page.locator("[data-account]")).toBeVisible(); // B's menu is up before the challenge
    await challenge();
    await expect(invite(b.page)).toContainText(`${a.username} challenged you to a match!`, { timeout: 5_000 });
    await b.page.screenshot({ path: "e2e/artifacts/screenshots/friends-invite.png" });
    await expect(invite(c.page)).toHaveCount(0);
    await invite(b.page).getByRole("button", { name: "Decline" }).click();
    await expect(invite(b.page)).toHaveCount(0);
    await expect(a.page.getByText(`${b.username} declined.`)).toBeVisible({ timeout: 5_000 });
    await a.page.getByRole("button", { name: "OK" }).click();
  });

  let id = "";
  await test.step("A challenges again, B accepts: both are in one friendly match, named by username", async () => {
    await challenge();
    await expect(invite(b.page)).toBeVisible({ timeout: 5_000 });
    await invite(b.page).getByRole("button", { name: "Accept" }).click();
    await expect(b.page).toHaveURL(/\/friendly\/[0-9a-f-]{36}$/);
    await expect(a.page).toHaveURL(b.page.url(), { timeout: 15_000 }); // A follows into the same match (the first dev compile is slow)
    await expect(a.page.locator("[data-puzzle-id]")).toBeVisible({ timeout: 10_000 });
    await expect(b.page.locator("[data-puzzle-id]")).toBeVisible({ timeout: 10_000 });
    id = await matchIdOnScreen(a.page);
    await expect(a.page.locator('[data-side="player"]')).toContainText(`${a.username} · 1200`);
    await expect(a.page.locator('[data-side="opponent"]')).toContainText(`${b.username} · 1200`);
    await expect(b.page.locator('[data-side="player"]')).toContainText(b.username);
    await a.page.screenshot({ path: "e2e/artifacts/screenshots/friends-match.png" });
    const { data } = await db.from("matches").select("mode, opponent_kind").eq("id", id).single();
    baseExpect(data).toEqual({ mode: "friendly", opponent_kind: "human" });
  });

  await test.step("B leaves: A wins, with no rating change shown or made, and may ask for a rematch", async () => {
    await b.context.close();
    await expect(a.page.getByRole("heading", { name: "Victory" })).toBeVisible({ timeout: 35_000 });
    await expect(a.page.locator("[data-rating-change]")).toHaveCount(0);
    await expect(a.page.getByText("Updating rating…")).toHaveCount(0);
    await expect(a.page.getByRole("button", { name: "Rematch" })).toBeVisible();
    await a.page.screenshot({ path: "e2e/artifacts/screenshots/friends-result.png" });
    baseExpect(await profile(a.username)).toEqual({ rating: 1200, matches_played: 0 });
    baseExpect(await profile(b.username)).toEqual({ rating: 1200, matches_played: 0 });
    const { data } = await db.from("matches").select("status, ranked_result").eq("id", id).single();
    baseExpect(data).toEqual({ status: "over", ranked_result: null });
  });

  await Promise.all([a.context.close(), c.context.close()]);
});

test("a friendly rematch both players accept is friendly again", async ({ browser }) => {
  test.setTimeout(4 * 60_000);
  const [a, b] = await Promise.all([player(browser), player(browser)]);
  // Friends already (made directly, the flow above covers the screens).
  const ids = await Promise.all(
    [a.username, b.username].map(async (u) => (await db.from("profiles").select("user_id").ilike("username", u).single()).data!.user_id as string),
  );
  const [x, y] = [...ids].sort();
  await db.from("friendships").insert({ user_a: x, user_b: y });

  await Promise.all([a.page.goto("/friends"), b.page.goto("/")]);
  await expect(b.page.locator("[data-account]")).toBeVisible();
  await a.page.getByLabel("Friends", { exact: true }).getByRole("button", { name: "Challenge" }).click();
  await b.page.locator("[data-invite]").getByRole("button", { name: "Accept" }).click();
  await expect(a.page).toHaveURL(/\/friendly\//, { timeout: 5_000 });
  const first = await matchIdOnScreen(a.page);

  // Both leave the round screens alone; the quickest end is a forfeit, so B's tab
  // stays but stops checking in: close it and come back for the rematch in a new one.
  await b.page.goto("about:blank");
  await expect(a.page.getByRole("heading", { name: "Victory" })).toBeVisible({ timeout: 35_000 });
  await b.page.goto(`/friendly/${first}`);
  await expect(b.page.getByRole("heading", { name: "Defeat" })).toBeVisible();

  // B (whose page just opened) asks; A, on the result screen all along, sees it and accepts.
  await b.page.getByRole("button", { name: "Rematch" }).click();
  await expect(a.page.getByText(`${b.username} wants a rematch!`)).toBeVisible({ timeout: 5_000 });
  await a.page.getByRole("button", { name: "Rematch" }).click();
  await expect(a.page.getByText(/^Round 1\/5 · /)).toBeVisible({ timeout: 10_000 });
  await expect(b.page.getByText(/^Round 1\/5 · /)).toBeVisible({ timeout: 10_000 });
  const second = await matchIdOnScreen(a.page);
  baseExpect(second).not.toBe(first);
  const { data } = await db.from("matches").select("mode").eq("id", second).single();
  baseExpect(data?.mode).toBe("friendly");
  await Promise.all([a.context.close(), b.context.close()]);
});
