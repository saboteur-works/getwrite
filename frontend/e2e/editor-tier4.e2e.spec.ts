import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Tier-4 regression coverage for the editor — the "long-tail" cases.
 *
 * - Undo / Redo round-trip on a toolbar action.
 * - The Math button is currently disabled ("Coming Soon!"); verify the
 *   sanity invariant so it doesn't silently re-enable without intent.
 * - Column-resize drag is intentionally skipped — drag interactions against
 *   ProseMirror's resize handles are historically flaky in Playwright.
 *   The test stub documents the gap so it's easy to revive later.
 */

// Storybook + TipTap occasionally drop the first keystrokes after iframe
// reload under combined-suite load. A single retry absorbs the timing race
// without masking real bugs.
test.describe.configure({ retries: 1 });

const INTERACTIVE_STORY = "/iframe.html?id=workarea-editview--interactive";

function editorBody(page: Page): Locator {
  return page.locator('[role="textbox"], [contenteditable="true"]').first();
}

function contentScope(page: Page): Locator {
  return page.locator(".tiptap-editor-content");
}

async function waitForEditorReady(page: Page): Promise<void> {
  await page.locator("#editor-menu-bar").waitFor({ state: "visible" });
  await page
    .getByRole("button", { name: /^Bold$/i })
    .waitFor({ state: "visible" });
  await page
    .locator(".ProseMirror [data-placeholder]")
    .first()
    .waitFor({ state: "attached" });
}

async function prepareEditor(page: Page, text = "hello world"): Promise<void> {
  await page.goto(INTERACTIVE_STORY);
  await waitForEditorReady(page);

  const editor = editorBody(page);
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
  await page.keyboard.type(text);
  await expect(editor).toContainText(text);
  await contentScope(page)
    .getByText(text, { exact: false })
    .first()
    .click({ clickCount: 3 });
}

async function clickToolbarButton(page: Page, name: string): Promise<void> {
  await page
    .getByRole("button", { name: new RegExp(`^${name}$`, "i") })
    .click();
}

test.describe("History", () => {
  test("Undo reverts a toolbar action and Redo re-applies it", async ({
    page,
  }) => {
    await prepareEditor(page);

    // Apply bold so there's an atomic editor transaction in the history.
    // A toolbar-driven mutation is deterministic to undo, unlike a
    // sequence of typed characters which TipTap may chunk inconsistently.
    await clickToolbarButton(page, "Bold");
    await expect
      .poll(async () => contentScope(page).locator("strong").count())
      .toBeGreaterThan(0);

    await clickToolbarButton(page, "Undo");
    await expect
      .poll(async () => contentScope(page).locator("strong").count())
      .toBe(0);

    await clickToolbarButton(page, "Redo");
    await expect
      .poll(async () => contentScope(page).locator("strong").count())
      .toBeGreaterThan(0);
  });

  test("Redo is disabled on a fresh document with nothing to redo", async ({
    page,
  }) => {
    await page.goto(INTERACTIVE_STORY);
    await waitForEditorReady(page);

    // Undo is *not* a safe "no history" probe here — TipTapEditor's
    // onCreate hook seeds an initial paragraph-leading transaction that
    // populates the undo stack. Redo, on the other hand, is empty on
    // first render because nothing has been undone yet.
    const redo = page.getByRole("button", { name: /^Redo$/i });
    await expect(redo).toBeDisabled();
  });
});

test.describe("Math", () => {
  test("Math button is disabled (feature gated)", async ({ page }) => {
    await page.goto(INTERACTIVE_STORY);
    await waitForEditorReady(page);

    // The Math command currently ships with isDisabled: () => true and
    // tooltipContent: "Coming Soon!", which becomes the button's
    // accessible name via the icon component.
    const math = page.getByRole("button", { name: /Coming Soon/i });
    await expect(math).toBeVisible();
    await expect(math).toBeDisabled();
  });
});

test.describe("Column resize", () => {
  // ProseMirror's column-resize handles are positioned dynamically and the
  // drag protocol Playwright uses (mousedown → mousemove → mouseup) doesn't
  // reliably trigger ProseMirror's pointer-event handlers, especially
  // across browser versions. We keep this test stubbed so the regression
  // intent is documented; revisit when Playwright's drag protocol or
  // TipTap's resize plugin improves.
  test.skip("Dragging a column-resize handle changes the column width", async () => {
    // Intentional no-op: documented gap.
  });
});
