import type { Page } from "@playwright/test";
import { expect, test, waitForClue } from "./helpers";

// §23 sounds are synthesised with Web Audio, so there is nothing to hear in a headless
// browser. Instead every oscillator the page creates is counted: each tone of each
// sound is one oscillator (see src/components/sound/player.ts).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __tones: number };
    w.__tones = 0;
    const create = BaseAudioContext.prototype.createOscillator;
    BaseAudioContext.prototype.createOscillator = function (this: BaseAudioContext) {
      w.__tones += 1;
      return create.call(this);
    };
  });
});

const tones = (page: Page) => page.evaluate(() => (window as unknown as { __tones: number }).__tones);
const toggle = (page: Page) => page.getByRole("button", { name: /^Turn sound (on|off)$/ });

test("sounds play in a match and the mute choice is remembered", async ({ page, shot }) => {
  await page.goto("/");
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false"); // sound on by default
  await shot("main-menu-sound-on");

  // Tapping PLAY unlocks audio; the round-start beeps (2 tones) follow.
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page.locator("[data-puzzle-id]")).toBeVisible();
  await expect.poll(() => tones(page)).toBeGreaterThanOrEqual(2);

  await test.step("a new clue pops", async () => {
    const before = await tones(page);
    await waitForClue(page, 2);
    await expect.poll(() => tones(page)).toBeGreaterThan(before);
  });

  await test.step("muting silences the game", async () => {
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    await expect(toggle(page)).toHaveAccessibleName("Turn sound on");
    await shot("match-sound-off");
    const before = await tones(page);
    await waitForClue(page, 3);
    await page.waitForTimeout(300);
    expect(await tones(page)).toBe(before);
  });

  await test.step("the choice survives a reload (localStorage)", async () => {
    expect(await page.evaluate(() => localStorage.getItem("fpb:sound"))).toBe("off");
    await page.reload();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    // Buzz is a real tap, so audio would be allowed now: only the mute keeps it silent.
    await page.getByRole("button", { name: /^Buzz/ }).click();
    await expect(page.getByLabel("Your answer")).toBeVisible();
    await page.waitForTimeout(300);
    expect(await tones(page)).toBe(0);
  });

  await test.step("unmuting plays a confirmation pop and brings sound back", async () => {
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => tones(page)).toBeGreaterThan(0);
    expect(await page.evaluate(() => localStorage.getItem("fpb:sound"))).toBe("on");
  });
});
