import { test, expect } from "@playwright/test";

/*
 * Removed: "editview interactive variant tracks content changes".
 *
 * It read a `[data-testid="editor-content"]` probe the story fed from an
 * `onChange` prop that `EditView` does not have — the component's only
 * callback is `onUnsavedChange`. The probe therefore never updated and the
 * test could not pass without adding a content callback to the product purely
 * to satisfy it.
 *
 * Its intent — typing in the editor is reflected outside it — is already
 * covered by `ui-flows.e2e.spec.ts`'s "edit view editor accepts input and
 * updates word count", which exercises the real footer. The story's dead
 * `onChange` wiring and probe were removed with it.
 */

test("editview displays initial content", async ({ page }) => {
  await page.goto("/iframe.html?id=workarea-editview--default");

  const editor = page
    .locator('[role="textbox"], [contenteditable="true"]')
    .first();
  const content = await editor.textContent();

  expect(content).toContain("Opening");
});

test("editview interactive variant captures typing", async ({ page }) => {
  await page.goto("/iframe.html?id=workarea-editview--interactive");

  const editor = page
    .locator('[role="textbox"], [contenteditable="true"]')
    .first();

  await editor.click();
  await page.keyboard.type("New paragraph");

  await expect(editor).toContainText("New paragraph");
});

test("editview decorates [[wiki links]] with the wiki-link class", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=workarea-editview--wiki-link-styling");

  const wikiLinks = page.locator(".wiki-link");
  await expect(wikiLinks).toHaveCount(2);
  await expect(wikiLinks.first()).toHaveText("[[Opening]]");
});
