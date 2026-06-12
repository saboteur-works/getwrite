import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end coverage for the Node Display footer indicator against the real
 * TipTap editor. Unit tests cover the label logic and the presentational
 * component in isolation; only a live ProseMirror selection can exercise the
 * full chain (caret → onSelectionUpdate → adapter → footer), so that is what
 * this spec drives.
 *
 * The Default EditView story seeds `<h2>Opening</h2><p>The sun sets over the
 * harbor.</p>`, giving a heading and a body paragraph to move the caret
 * between without touching the toolbar.
 */
const DEFAULT_STORY = "/iframe.html?id=workarea-editview--default";

function contentScope(page: Page) {
  return page.locator(".tiptap-editor-content");
}

/** The node-type value shown in the footer (the `<strong>` after "Node:"). */
function nodeValue(page: Page) {
  return page.getByTestId("node-type-indicator").locator("strong");
}

async function prepare(page: Page): Promise<void> {
  await page.goto(DEFAULT_STORY);
  await page.locator("#editor-menu-bar").waitFor({ state: "visible" });
  await contentScope(page)
    .getByText("Opening", { exact: false })
    .first()
    .waitFor({ state: "visible" });
}

test.describe("Node Display footer indicator", () => {
  test("shows the heading level when the caret is in a heading", async ({
    page,
  }) => {
    await prepare(page);
    await contentScope(page).getByText("Opening", { exact: false }).click();
    await expect(nodeValue(page)).toHaveText("Heading 2");
  });

  test("shows Body when the caret is in a paragraph", async ({ page }) => {
    await prepare(page);
    await contentScope(page)
      .getByText("The sun sets over the harbor.", { exact: false })
      .click();
    await expect(nodeValue(page)).toHaveText("Body");
  });

  test("lists each distinct type for a selection spanning multiple nodes", async ({
    page,
  }) => {
    await prepare(page);
    // Place the caret in the editor, then select the whole document so the
    // selection spans both the heading and the paragraph.
    await contentScope(page).getByText("Opening", { exact: false }).click();
    await page.keyboard.press("ControlOrMeta+A");
    await expect(nodeValue(page)).toHaveText("Heading 2, Body");
  });
});
