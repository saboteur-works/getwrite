import { test, expect, type Page } from "@playwright/test";

/**
 * Captures clean, caption-free full-app screenshots of the demo project for the
 * Route B montage fallback. Run after seeding (node demo/seed.mjs):
 *
 *   pnpm --filter getwrite-frontend exec playwright test screens.spec.ts \
 *     --config ../demo/playwright.demo.config.ts
 *
 * Output: demo/out/shots/NN-*.png
 */

const PROJECT = "The Lighthouse Keeper";
const DIR = "out/shots";
const settle = (page: Page) => page.waitForTimeout(450);

async function expandFolder(page: Page, name: string): Promise<void> {
  const item = page.getByRole("treeitem", { name, exact: true });
  await item.scrollIntoViewIfNeeded();
  await item.locator("xpath=..").getByRole("button").first().click();
  await settle(page);
}

test("capture demo screenshots", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "GetWrite", level: 1 }),
  ).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${DIR}/01-start.png` });

  await page.getByRole("button", { name: `Open ${PROJECT}` }).click();
  await expect(page.getByRole("tab", { name: "Edit" })).toBeVisible();
  await expandFolder(page, "Workspace");
  await page
    .getByRole("treeitem", { name: "Chapter One — The Light", exact: true })
    .click();
  const editor = page.locator(".tiptap.ProseMirror");
  await expect(
    editor.getByRole("heading", { name: "Chapter One — The Light" }),
  ).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${DIR}/02-editor.png` });

  // Structured metadata: a chapter with built-in + custom fields (Arc, Tension).
  await page
    .getByRole("treeitem", {
      name: "Chapter Two — Salt and Static",
      exact: true,
    })
    .click();
  await expect(
    editor.getByRole("heading", { name: "Chapter Two — Salt and Static" }),
  ).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${DIR}/03-metadata.png` });

  await expandFolder(page, "Story Elements");
  await page.getByRole("treeitem", { name: "Mara Vance", exact: true }).click();
  await expect(
    page
      .locator(".tiptap.ProseMirror")
      .getByRole("heading", { name: "Mara Vance" }),
  ).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${DIR}/04-wikilinks.png` });

  const search = page.getByRole("textbox", { name: "resource-search" });
  await search.click();
  await search.fill("keeper");
  await settle(page);
  await page.screenshot({ path: `${DIR}/05-search.png` });
  await search.fill("");
  await page.keyboard.press("Escape");

  // Data view — full project overview.
  await page.getByRole("tab", { name: "Data" }).click();
  await expect(page.getByText("Total Words", { exact: false })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${DIR}/06-data.png` });

  // Complex query: a saved smart folder revealing its AND/OR structure + matches.
  await page
    .getByRole("button", { name: "High-Tension Scenes", exact: true })
    .click();
  await expect(page.getByText("2 matches", { exact: false })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${DIR}/07-query.png` });
});
