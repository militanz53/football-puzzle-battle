import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PUZZLES_TABLE, rowToPuzzle, type PuzzleRow } from "../src/data/rows";
import type { Puzzle, PuzzleType } from "../src/game/types";

export const ARTIFACTS = path.join(__dirname, "artifacts");
export const SCREENSHOTS = path.join(ARTIFACTS, "screenshots");

/**
 * The Supabase table the dev server reads, with the secret key (.env.local is loaded
 * by playwright.config.ts). Tests look answers up here and clean up after themselves.
 */
export const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

export async function puzzleById(id: string): Promise<Puzzle> {
  const { data, error } = await db.from(PUZZLES_TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not look up ${id}: ${error.message}`);
  if (!data) throw new Error(`Puzzle ${id} is on screen but not in the puzzles table`);
  return rowToPuzzle(data as PuzzleRow);
}

export type LogEntry = { at: string; kind: string; text: string };

/**
 * `log` collects console errors/warnings, uncaught page errors and failed requests;
 * `shot` saves numbered screenshots to e2e/artifacts/screenshots/<scenario>/.
 * Both are written out after the test so the report can point at them.
 */
export const test = base.extend<{ log: LogEntry[]; shot: (name: string) => Promise<void> }>({
  log: [async ({ page }, provide, testInfo) => {
    const entries: LogEntry[] = [];
    const add = (kind: string, text: string) => entries.push({ at: new Date().toISOString(), kind, text });
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") add(`console.${msg.type()}`, msg.text());
    });
    page.on("pageerror", (err) => add("pageerror", `${err.name}: ${err.message}`));
    page.on("requestfailed", (req) => {
      // Aborted RSC prefetches on navigation are normal; everything else is logged.
      if (req.failure()?.errorText !== "net::ERR_ABORTED") add("requestfailed", `${req.method()} ${req.url()} ${req.failure()?.errorText}`);
    });

    await provide(entries);

    const slug = slugify(testInfo.title);
    mkdirSync(ARTIFACTS, { recursive: true });
    const file = path.join(ARTIFACTS, `console-${slug}.log`);
    writeFileSync(
      file,
      entries.length === 0 ? "(no console errors, warnings, page errors or failed requests)\n" : entries.map((e) => `${e.at} [${e.kind}] ${e.text}`).join("\n") + "\n",
    );
    await testInfo.attach("console log", { path: file, contentType: "text/plain" });
  }, { auto: true }],

  shot: async ({ page }, provide, testInfo) => {
    const dir = path.join(SCREENSHOTS, slugify(testInfo.title));
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    let n = 0;
    await provide(async (name: string) => {
      n += 1;
      await page.screenshot({ path: path.join(dir, `${String(n).padStart(2, "0")}-${slugify(name)}.png`), fullPage: true });
    });
  },
});

export { expect };

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Match driving
// ---------------------------------------------------------------------------

export const TYPE_LABEL: Record<PuzzleType, string> = {
  goal_map: "Goal Map",
  photo_reveal: "Photo Reveal",
  missing_xi: "Missing XI",
  career_journey: "Career Journey",
  teammate_web: "Teammate Web",
};

/** The button on the round result screen (its label says what comes next). */
export const nextButton = (page: Page) =>
  page.getByRole("button", { name: /^(Next round|See match result|Sudden death)$/ });

/** The puzzle on screen, from the round card's data attributes. */
export async function currentPuzzle(page: Page): Promise<Puzzle> {
  const card = page.locator("[data-puzzle-id]");
  await expect(card).toBeVisible({ timeout: 15_000 });
  return await puzzleById((await card.getAttribute("data-puzzle-id"))!);
}

export async function buzz(page: Page) {
  const button = page.getByRole("button", { name: /^Buzz/ });
  // Disabled while the bot is answering; answering is exclusive (§7).
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.click();
  await expect(page.getByLabel("Your answer")).toBeVisible();
}

export async function answer(page: Page, text: string) {
  await page.getByLabel("Your answer").fill(text);
  await page.getByRole("button", { name: "Submit" }).click();
}

export async function waitForClue(page: Page, n: number) {
  await expect(page.getByText(`Clue ${n}/5`, { exact: true })).toBeVisible({ timeout: 20_000 });
}

/** Waits for the round result; a round can last 15 s plus the answer windows. */
export async function waitForRoundResult(page: Page) {
  await expect(nextButton(page)).toBeVisible({ timeout: 45_000 });
  return (await nextButton(page).textContent())!.trim();
}

/** The round result moves on by itself after 3.5 s; wait for that rather than racing it. */
export async function waitForNextRound(page: Page) {
  await expect(nextButton(page)).toBeHidden({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** The /admin password from .env.local (loaded by playwright.config.ts). */
export const ADMIN_PASSWORD = process.env.ADMIN_PANEL_PASSWORD ?? "";

/** Signs in through the login form, then lands on `path`. */
export async function signInAsAdmin(page: Page, path = "/admin") {
  if (!ADMIN_PASSWORD) throw new Error("ADMIN_PANEL_PASSWORD is not set in .env.local");
  await page.goto(path);
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, "\?")}$`));
}
