import type { Page } from "@playwright/test";
import { PUZZLES_TABLE } from "../src/data/rows";
import { EXAMPLE_IMPORT } from "../src/data/schemaGuide";
import { db, expect, signInAsAdmin, test } from "./helpers";

// Bulk import → drafts → review and publish, against the real Supabase table.
// The test's puzzles get "e2e_" ids and answers no real puzzle uses, and are deleted
// before and after, so the run leaves the table as it found it. It never uses
// "Select all" to publish: that would also publish any real drafts waiting there.

const BATCH = EXAMPLE_IMPORT.map((p) => ({
  ...p,
  id: `e2e_${p.type}`,
  correct_answer: `${p.correct_answer} E2E`,
  answer_aliases: [],
}));
const IDS = BATCH.map((p) => p.id);

async function removeTestPuzzles() {
  const { error } = await db.from(PUZZLES_TABLE).delete().in("id", IDS);
  if (error) throw new Error(`Could not clean up e2e puzzles: ${error.message}`);
}

test.beforeAll(removeTestPuzzles);
test.afterAll(removeTestPuzzles);

const row = (page: Page, id: string) => page.locator("tbody tr").filter({ has: page.getByRole("cell", { name: id, exact: true }) });
const draftCount = async (page: Page) => {
  let n = 0;
  for (const id of IDS) if ((await row(page, id).count()) > 0) n += 1;
  return n;
};

test("imported puzzles arrive as drafts and are published in bulk or one by one", async ({ page, shot }) => {
  await test.step("bulk import brings the puzzles in as drafts", async () => {
    await signInAsAdmin(page, "/admin/import");
    await page.getByPlaceholder(/"type": "career_journey"/).fill(JSON.stringify(BATCH));
    await page.getByRole("button", { name: "Validate" }).click();
    await expect(page.getByText(`${BATCH.length} ready to add as drafts`)).toBeVisible();
    await page.getByRole("button", { name: `Add ${BATCH.length} drafts` }).click();
    await expect(page.getByText(`Added ${BATCH.length} draft(s)`)).toBeVisible();
    await shot("import-done");

    const { data } = await db.from(PUZZLES_TABLE).select("id, status").in("id", IDS);
    expect(data?.map((r) => r.status)).toEqual(IDS.map(() => "draft"));
  });

  await test.step("the drafts view lists them with checkboxes", async () => {
    await page.getByRole("link", { name: "Review drafts →" }).click();
    await expect(page).toHaveURL(/status=draft/);
    for (const id of IDS) await expect(page.getByRole("checkbox", { name: `Select ${id}` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish selected (0)" })).toBeDisabled();
    await shot("drafts-view");
  });

  await test.step("select all ticks every draft (not used to publish, see above)", async () => {
    const selectAll = page.getByRole("checkbox", { name: "Select all drafts" });
    await selectAll.check();
    for (const id of IDS) await expect(page.getByRole("checkbox", { name: `Select ${id}` })).toBeChecked();
    await selectAll.uncheck();
    await expect(page.getByRole("button", { name: "Publish selected (0)" })).toBeDisabled();
  });

  await test.step("publish two selected drafts at once", async () => {
    await page.getByRole("checkbox", { name: `Select ${IDS[0]}` }).check();
    await page.getByRole("checkbox", { name: `Select ${IDS[1]}` }).check();
    await shot("two-selected");
    await page.getByRole("button", { name: "Publish selected (2)" }).click();
    await expect(page.getByRole("status")).toHaveText(`Published ${[IDS[0], IDS[1]].sort().join(", ")}.`);
    await expect.poll(() => draftCount(page)).toBe(IDS.length - 2);
  });

  await test.step("publish a single draft from its row", async () => {
    await page.getByRole("button", { name: `Publish ${IDS[2]}` }).click();
    await expect(page.getByRole("status")).toHaveText(`Published ${IDS[2]}.`);
    await expect.poll(() => draftCount(page)).toBe(IDS.length - 3);
  });

  await test.step("publish the rest by ticking them", async () => {
    for (const id of IDS.slice(3)) await page.getByRole("checkbox", { name: `Select ${id}` }).check();
    await page.getByRole("button", { name: `Publish selected (${IDS.length - 3})` }).click();
    await expect.poll(() => draftCount(page)).toBe(0);
    await shot("all-published");
  });

  await test.step("the table has them all as published", async () => {
    await page.getByRole("link", { name: "Published", exact: true }).click();
    for (const id of IDS) await expect(page.getByRole("cell", { name: id, exact: true })).toBeVisible();
    const { data } = await db.from(PUZZLES_TABLE).select("id, status").in("id", IDS);
    expect(data?.map((r) => r.status)).toEqual(IDS.map(() => "published"));
  });
});
