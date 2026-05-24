import { test, expect } from "@playwright/test";

const STORY = "/iframe.html?id=layout-appshellafteropen--default";

test("appshell renders the project name in the work area", async ({ page }) => {
  await page.goto(STORY);

  // No resource selected → AppShell shows the Work Area heading with project name.
  await expect(
    page.getByRole("heading", { name: "After-Open Project", level: 2 }),
  ).toBeVisible();
});

async function expandChaptersFolder(
  page: import("@playwright/test").Page,
): Promise<void> {
  // Folders render with a chevron-toggling icon button as the first button
  // inside the .resource-tree-item div, and a name button after it.
  const chaptersItem = page
    .locator(".resource-tree-item")
    .filter({ hasText: "Chapters" })
    .first();
  await chaptersItem.locator(".resource-tree-icon-button").click();
}

test("appshell resource tree shows the seeded resources", async ({ page }) => {
  await page.goto(STORY);

  const chaptersFolder = page
    .locator(".resource-tree-button")
    .filter({ hasText: "Chapters" })
    .first();
  await expect(chaptersFolder).toBeVisible();

  await expandChaptersFolder(page);

  const tree = page.locator(".resource-tree-button");
  await expect(
    tree.filter({ hasText: "Opening Chapter" }).first(),
  ).toBeVisible();
  await expect(
    tree.filter({ hasText: "Second Chapter" }).first(),
  ).toBeVisible();
});

test("clicking a tree resource fires onResourceSelect with its id", async ({
  page,
}) => {
  await page.goto(STORY);
  await expandChaptersFolder(page);

  await page
    .locator(".resource-tree-button")
    .filter({ hasText: "Opening Chapter" })
    .first()
    .click();

  await expect(
    page.locator('[data-testid="last-selected-resource"]'),
  ).toHaveText("after-open-res-1");
});

test("selecting a resource swaps the editor content and header", async ({
  page,
}) => {
  await page.goto(STORY);
  await expandChaptersFolder(page);

  await page
    .locator(".resource-tree-button")
    .filter({ hasText: "Opening Chapter" })
    .first()
    .click();

  const editor = page
    .locator('[role="textbox"], [contenteditable="true"]')
    .first();
  await expect(editor).toContainText(/opening chapter body/i);

  await page
    .locator(".resource-tree-button")
    .filter({ hasText: "Second Chapter" })
    .first()
    .click();

  await expect(editor).toContainText(/second chapter body/i);
  await expect(editor).not.toContainText(/opening chapter body/i);
});
