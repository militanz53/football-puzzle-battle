import { expect as baseExpect } from "@playwright/test";
import { db, expect, matchIdOnScreen, MATCHMAKING_TIMEOUT, scoreOf, test, waitForOpponent, waitForRoundResult } from "./helpers";

// Quick Match (GDD §13.1): the searching screen, the opponent's name, and what is
// recorded behind the scenes. The player must never see that the opponent is a bot.

/** Every visible word on the page, for the "never says bot" check. */
const visibleText = (page: import("@playwright/test").Page) => page.locator("body").innerText();

test("searching, then a named opponent, and never a mention of a bot", async ({ page, shot }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Play" }).click();

  await test.step("the searching screen shows while the server looks for an opponent", async () => {
    await expect(page.getByRole("heading", { name: "Finding an opponent…" })).toBeVisible();
    await expect(page.getByText("Quick Match · 5 rounds")).toBeVisible();
    await expect(page.getByText(/^0:0[1-9]$/)).toBeVisible(); // the seconds count up
    await shot("searching");
  });

  let name = "";
  await test.step("after the search window an opponent is found by name", async () => {
    await expect(page.getByText("Opponent found")).toBeVisible({ timeout: MATCHMAKING_TIMEOUT });
    name = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
    expect(name).toMatch(/^[\p{L}\p{N}_]{3,16}$/u);
    await shot("opponent-found");
    await expect(page.locator("[data-puzzle-id]")).toBeVisible();
  });

  await test.step("the opponent is named on the scoreboard and nothing says bot", async () => {
    await expect(page.locator('[data-side="opponent"]')).toContainText(name);
    expect(await visibleText(page)).not.toMatch(/\bbot\b/i);
    await shot("round-1");
  });

  await test.step("the round result names the opponent, still no bot", async () => {
    await waitForRoundResult(page);
    await expect(page.locator('[data-side="opponent"]')).toContainText(name);
    await expect(page.getByText(name, { exact: true }).last()).toBeVisible();
    expect(await visibleText(page)).not.toMatch(/\bbot\b/i);
    await shot("round-result");
  });

  await test.step("behind the scenes the match is recorded as a bot match", async () => {
    const id = await matchIdOnScreen(page);
    const { data: match } = await db.from("matches").select("opponent_kind, opponent_name, queue_entry_id").eq("id", id).single();
    baseExpect(match).toMatchObject({ opponent_kind: "bot", opponent_name: name });
    const { data: entry } = await db.from("match_queue").select("status, match_id").eq("id", match!.queue_entry_id).single();
    baseExpect(entry).toEqual({ status: "timed_out", match_id: id });
  });
});

test("two players who press PLAY together are paired into one shared match", async ({ browser }) => {
  // Separate contexts = separate browsers = separate anonymous sessions.
  const [a, b] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [pageA, pageB] = await Promise.all([a.newPage(), b.newPage()]);
  await Promise.all([pageA.goto("/match"), pageB.goto("/match")]);

  const [nameA, nameB] = await Promise.all([waitForOpponent(pageA), waitForOpponent(pageB)]);
  expect(nameA).not.toMatch(/bot/i);
  expect(nameB).not.toMatch(/bot/i);

  const [idA, idB] = await Promise.all([matchIdOnScreen(pageA), matchIdOnScreen(pageB)]);
  baseExpect(idA).toBe(idB); // one match row for both
  const { data: match } = await db.from("matches").select("opponent_kind, players").eq("id", idA).single();
  baseExpect(match?.opponent_kind).toBe("human");
  const { data: queue } = await db.from("match_queue").select("id, status, paired_with, match_id").eq("match_id", idA);
  baseExpect(queue).toHaveLength(2);
  for (const row of queue!) {
    baseExpect(row.status).toBe("paired");
    baseExpect(row.paired_with).not.toBe(row.id);
  }
  await Promise.all([a.close(), b.close()]);
});

test("Cancel leaves the queue and returns to the menu", async ({ page }) => {
  let entryId = "";
  page.on("response", async (res) => {
    // The joining Server Function answers with the new entry id.
    const body = await res.text().catch(() => "");
    const match = body.match(/"entryId":"([0-9a-f-]{36})"/);
    if (match) entryId = match[1];
  });
  await page.goto("/match");
  await expect(page.getByRole("heading", { name: "Finding an opponent…" })).toBeVisible();
  await baseExpect.poll(() => entryId).not.toBe("");
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page).toHaveURL("/");
  await baseExpect
    .poll(async () => (await db.from("match_queue").select("status").eq("id", entryId).single()).data?.status)
    .toBe("abandoned");
  await expect(scoreOf(page, "player")).toHaveCount(0);
});
