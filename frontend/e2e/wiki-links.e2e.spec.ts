import { test, expect } from "@playwright/test";

const INTERACTIVE_STORY = "/iframe.html?id=workarea-editview--interactive";

test.describe("Wiki-link live decoration", () => {
  test("typed [[Target]] gets a wiki-link decoration", async ({ page }) => {
    await page.goto(INTERACTIVE_STORY);

    const editor = page
      .locator('[role="textbox"], [contenteditable="true"]')
      .first();
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type("See [[Target]]");

    const wikiLinks = page.locator(".wiki-link");
    await expect(wikiLinks).toHaveCount(1);
    await expect(wikiLinks.first()).toHaveText("[[Target]]");
  });

  test("multiple [[refs]] each get their own decoration", async ({ page }) => {
    await page.goto(INTERACTIVE_STORY);

    const editor = page
      .locator('[role="textbox"], [contenteditable="true"]')
      .first();
    await editor.click();
    await page.keyboard.type("Linking [[Alpha]] and [[Beta]] together.");

    const wikiLinks = page.locator(".wiki-link");
    await expect(wikiLinks).toHaveCount(2);
    await expect(wikiLinks.nth(0)).toHaveText("[[Alpha]]");
    await expect(wikiLinks.nth(1)).toHaveText("[[Beta]]");
  });

  test("breaking the [[ pattern removes the decoration", async ({ page }) => {
    await page.goto(INTERACTIVE_STORY);

    const editor = page
      .locator('[role="textbox"], [contenteditable="true"]')
      .first();
    await editor.click();
    await page.keyboard.type("Hold [[Target]]");

    const wikiLinks = page.locator(".wiki-link");
    await expect(wikiLinks).toHaveCount(1);

    // Delete the closing brackets to break the pattern (cursor is at the end).
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");

    await expect(wikiLinks).toHaveCount(0);
  });
});
