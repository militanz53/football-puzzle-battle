import { PUZZLES_TABLE } from "../src/data/rows";
import { ADMIN_PASSWORD, db, expect, signInAsAdmin, test } from "./helpers";

// The /admin password gate: nothing of the panel without the password (pages or
// requests), a wrong password is refused, the right one is remembered for 7 days.

const PANEL_PAGES = ["/admin", "/admin/import", "/admin/new", "/admin/edit/goal_001", "/admin?status=draft"];

/** Real panel data that must never reach a signed-out browser: a puzzle's answer. */
async function secretAnswer(): Promise<string> {
  const { data, error } = await db.from(PUZZLES_TABLE).select("correct_answer").eq("id", "goal_001").single();
  if (error) throw new Error(error.message);
  return data.correct_answer as string;
}

test("the admin panel is closed without the password", async ({ page, request, shot }) => {
  const answer = await secretAnswer();
  await test.step("every panel page goes to the login screen, showing no panel content", async () => {
    for (const path of PANEL_PAGES) {
      await page.goto(path);
      await expect(page).toHaveURL(`/admin/login?next=${encodeURIComponent(path)}`);
      await expect(page.getByRole("heading", { name: "Puzzle Admin" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Bulk import" })).toHaveCount(0);
      expect(await page.content()).not.toContain(answer);
    }
    await shot("login-screen");
  });

  await test.step("requests without the cookie get nothing either", async () => {
    for (const path of PANEL_PAGES) {
      const get = await request.get(path, { maxRedirects: 0 });
      expect(get.status(), path).toBe(307);
      expect(await get.text()).not.toContain(answer);
    }
    // Server Functions are POSTs; without a session they are refused before running.
    const post = await request.post("/admin", { maxRedirects: 0, headers: { "Next-Action": "0".repeat(42) } });
    expect(post.status()).toBe(401);
  });

  await test.step("a wrong password is refused with a message", async () => {
    await page.goto("/admin/login");
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#login-error")).toHaveText("Wrong password.");
    await expect(page).toHaveURL(/\/admin\/login/);
    expect(await page.context().cookies()).toEqual([]);
    await shot("wrong-password");
  });
});

test("the right password opens the panel and is remembered for 7 days", async ({ page, browser, shot }) => {
  await test.step("signing in returns to the page that was asked for", async () => {
    await signInAsAdmin(page, "/admin/import");
    await expect(page.getByRole("heading", { name: "Bulk import" })).toBeVisible();
    await shot("signed-in");
  });

  await test.step("the session cookie is httpOnly, limited to /admin, and lasts 7 days", async () => {
    const [cookie] = await page.context().cookies();
    expect(cookie).toMatchObject({ name: "fpb_admin", httpOnly: true, path: "/admin", sameSite: "Lax" });
    const days = (cookie.expires * 1000 - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  await test.step("closing and reopening the browser keeps you signed in", async () => {
    const saved = await page.context().storageState();
    await page.context().close();
    const reopened = await browser.newContext({ storageState: saved });
    const again = await reopened.newPage();
    await again.goto("/admin");
    await expect(again).toHaveURL("/admin");
    await expect(again.getByRole("link", { name: "Bulk import" })).toBeVisible();

    await test.step("signing out closes the panel again", async () => {
      await again.getByRole("button", { name: "Sign out" }).click();
      await expect(again).toHaveURL("/admin/login");
      await again.goto("/admin");
      await expect(again).toHaveURL(/\/admin\/login\?next=%2Fadmin$/);
    });
    await reopened.close();
  });

  expect(ADMIN_PASSWORD.length).toBeGreaterThanOrEqual(16);
});
