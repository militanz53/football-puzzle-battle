import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { EXAMPLE_IMPORT } from "../src/data/schemaGuide";
import { expect, test } from "./helpers";

// Bulk import → drafts → review and publish. The admin writes src/data/puzzles.json
// on the running dev server, so the file is saved first and always put back.
const PUZZLES_FILE = path.join(__dirname, "..", "src", "data", "puzzles.json");
let original = "";

test.beforeAll(() => {
  original = readFileSync(PUZZLES_FILE, "utf8");
});

test.afterAll(() => {
  writeFileSync(PUZZLES_FILE, original);
});

const draftRows = (page: Page) => page.locator("tbody tr").filter({ hasText: "draft" });

test("imported puzzles arrive as drafts and are published in bulk or one by one", async ({ page, shot }) => {
  await test.step("bulk import brings the puzzles in as drafts", async () => {
    await page.goto("/admin/import");
    await page.getByPlaceholder(/"type": "career_journey"/).fill(JSON.stringify(EXAMPLE_IMPORT));
    await page.getByRole("button", { name: "Validate" }).click();
    await expect(page.getByText(`${EXAMPLE_IMPORT.length} ready to add as drafts`)).toBeVisible();
    await page.getByRole("button", { name: `Add ${EXAMPLE_IMPORT.length} drafts` }).click();
    await expect(page.getByText(`Added ${EXAMPLE_IMPORT.length} draft(s)`)).toBeVisible();
    await shot("import-done");
  });

  await test.step("the drafts view lists them with checkboxes", async () => {
    await page.getByRole("link", { name: "Review drafts →" }).click();
    await expect(page).toHaveURL(/status=draft/);
    await expect(draftRows(page)).toHaveCount(EXAMPLE_IMPORT.length);
    await expect(page.getByText(`0 of ${EXAMPLE_IMPORT.length} selected`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish selected (0)" })).toBeDisabled();
    await shot("drafts-view");
  });

  const ids = await draftRows(page).locator("td.font-mono").allTextContents();

  await test.step("publish two selected drafts at once", async () => {
    await page.getByRole("checkbox", { name: `Select ${ids[0]}` }).check();
    await page.getByRole("checkbox", { name: `Select ${ids[1]}` }).check();
    await shot("two-selected");
    await page.getByRole("button", { name: "Publish selected (2)" }).click();
    await expect(page.getByRole("status")).toHaveText(`Published ${ids[0]}, ${ids[1]}.`);
    await expect(draftRows(page)).toHaveCount(EXAMPLE_IMPORT.length - 2);
  });

  await test.step("publish a single draft from its row", async () => {
    await page.getByRole("button", { name: `Publish ${ids[2]}` }).click();
    await expect(page.getByRole("status")).toHaveText(`Published ${ids[2]}.`);
    await expect(draftRows(page)).toHaveCount(EXAMPLE_IMPORT.length - 3);
  });

  await test.step("select all publishes the rest", async () => {
    await page.getByRole("checkbox", { name: "Select all drafts" }).check();
    await page.getByRole("button", { name: `Publish selected (${EXAMPLE_IMPORT.length - 3})` }).click();
    await expect(page.getByText("No drafts waiting for review.")).toBeVisible();
    await shot("all-published");
  });

  await test.step("they are now listed as published", async () => {
    await page.getByRole("link", { name: "Published", exact: true }).click();
    for (const id of ids) await expect(page.getByRole("cell", { name: id, exact: true })).toBeVisible();
    const saved = JSON.parse(readFileSync(PUZZLES_FILE, "utf8")) as { id: string; status: string }[];
    expect(saved.filter((p) => ids.includes(p.id)).map((p) => p.status)).toEqual(ids.map(() => "published"));
  });
});
