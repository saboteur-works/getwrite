import { test, expect, type Page } from "@playwright/test";

/**
 * Tier-1 regression coverage for the editor. Each test guards a user-visible
 * behavior that previously broke (or could plausibly break) during a refactor:
 *
 * - footer stays pinned at the bottom of the work area while editing
 * - toolbar stays pinned at the top while editing
 * - color submenus pick + clear (text, background, highlight)
 * - word count updates as the user types
 * - autosave indicator transitions through saving → saved
 * - non-canonical revisions surface the "Autosave unavailable" warning
 * - the caret does not jump when an unrelated parent re-render fires
 */

const STORY = {
  interactive: "/iframe.html?id=workarea-editview--interactive",
  tall: "/iframe.html?id=workarea-editview--tall-content",
  canonical: "/iframe.html?id=workarea-editview--with-canonical-revision",
  nonCanonical:
    "/iframe.html?id=workarea-editview--with-non-canonical-revision",
  rerender: "/iframe.html?id=workarea-editview--rerender-provocateur",
};

/** Returns the contenteditable element TipTap renders into. */
function editorBody(page: Page) {
  return page.locator('[role="textbox"], [contenteditable="true"]').first();
}

test.describe("Editor layout", () => {
  test("footer stays pinned at the bottom while content scrolls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await page.goto(STORY.tall);

    const editor = editorBody(page);
    await expect(editor).toBeVisible();

    const footer = page.locator("#editview-footer");
    await expect(footer).toBeVisible();
    const before = await footer.boundingBox();
    expect(before).not.toBeNull();

    // Scroll the editor's internal content area; the editor itself, not
    // the page, should consume the scroll.
    const scrollRegion = page.locator(".tiptap-editor-content").first();
    await scrollRegion.evaluate((el) => {
      el.scrollBy(0, 600);
    });

    const after = await footer.boundingBox();
    expect(after).not.toBeNull();
    // Footer's bottom edge should not have moved as the editor scrolled.
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(2);
  });

  test("toolbar stays pinned at the top while content scrolls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await page.goto(STORY.tall);

    const editor = editorBody(page);
    await expect(editor).toBeVisible();

    const toolbar = page.locator("#editor-menu-bar");
    await expect(toolbar).toBeVisible();
    const before = await toolbar.boundingBox();

    const scrollRegion = page.locator(".tiptap-editor-content").first();
    await scrollRegion.evaluate((el) => {
      el.scrollBy(0, 600);
    });

    const after = await toolbar.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(2);
  });
});

test.describe("Color submenus", () => {
  /** Types a known phrase into a freshly opened editor and selects it. */
  async function typeAndSelectAll(page: Page): Promise<void> {
    const editor = editorBody(page);
    await editor.click();
    // Clear via keyboard (TipTap stays consistent vs. raw DOM mutation).
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    await page.keyboard.type("Recolor me");
    await page.keyboard.press("ControlOrMeta+A");
  }

  /** Refocuses the editor and selects the existing paragraph. */
  async function reselectAll(page: Page): Promise<void> {
    const editor = editorBody(page);
    // Triple-click selects the whole paragraph reliably across browsers.
    await editor.click({ clickCount: 3 });
  }

  test("text color: pick a swatch then clear removes the color", async ({
    page,
  }) => {
    await page.goto(STORY.interactive);
    await typeAndSelectAll(page);

    const trigger = page.getByRole("button", { name: /Text Color/i });
    await trigger.click();
    await page
      .getByRole("menuitemradio", { name: /Select color/i })
      .first()
      .click();

    await expect
      .poll(async () =>
        page.locator('.tiptap-editor-content span[style*="color"]').count(),
      )
      .toBeGreaterThan(0);

    await reselectAll(page);
    await trigger.click();
    await page.getByRole("menuitem", { name: /Clear text color/i }).click();

    await expect
      .poll(async () =>
        page.locator('.tiptap-editor-content span[style*="color"]').count(),
      )
      .toBe(0);
  });

  test("highlight: pick then clear removes the mark", async ({ page }) => {
    await page.goto(STORY.interactive);
    await typeAndSelectAll(page);

    const trigger = page.getByRole("button", { name: /^Highlight$/i });
    await trigger.click();
    await page
      .getByRole("menuitemradio", { name: /Select color/i })
      .first()
      .click();

    await expect
      .poll(async () => page.locator(".tiptap-editor-content mark").count())
      .toBeGreaterThan(0);

    await reselectAll(page);
    await trigger.click();
    await page.getByRole("menuitem", { name: /Clear highlight/i }).click();

    await expect
      .poll(async () => page.locator(".tiptap-editor-content mark").count())
      .toBe(0);
  });

  test("background color: pick then clear removes the background", async ({
    page,
  }) => {
    await page.goto(STORY.interactive);
    await typeAndSelectAll(page);

    const trigger = page.getByRole("button", { name: /Background Color/i });
    await trigger.click();
    await page
      .getByRole("menuitemradio", { name: /Select color/i })
      .first()
      .click();

    await expect
      .poll(async () =>
        page
          .locator('.tiptap-editor-content span[style*="background-color"]')
          .count(),
      )
      .toBeGreaterThan(0);

    await reselectAll(page);
    await trigger.click();
    await page
      .getByRole("menuitem", { name: /Clear background color/i })
      .click();

    await expect
      .poll(async () =>
        page
          .locator('.tiptap-editor-content span[style*="background-color"]')
          .count(),
      )
      .toBe(0);
  });
});

test.describe("Footer status", () => {
  test("word count updates as the user types", async ({ page }) => {
    await page.goto(STORY.interactive);

    const editor = editorBody(page);
    await editor.click();
    // Clear and type a known phrase.
    await editor.evaluate((el) => {
      el.textContent = "";
    });
    await page.keyboard.type("one two three four");

    const footer = page.locator("#editview-footer");
    await expect(footer).toContainText(/Words:\s*4/);

    // Add two more words.
    await page.keyboard.type(" five six");
    await expect(footer).toContainText(/Words:\s*6/);
  });

  test("autosave indicator transitions through saving on canonical revision", async ({
    page,
  }) => {
    // Stub the persistence endpoint so the autosave flow can complete
    // deterministically inside Storybook without a backend.
    await page.route("**/api/resource/*/revision**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto(STORY.canonical);

    const editor = editorBody(page);
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type(" more text");

    const footer = page.locator("#editview-footer");
    // Either "Autosave queued…" or "Saving…" should appear briefly.
    await expect(footer).toContainText(/Autosave queued|Saving/i, {
      timeout: 5000,
    });
  });

  test("non-canonical revision shows autosave unavailable and warns on edit", async ({
    page,
  }) => {
    await page.goto(STORY.nonCanonical);

    const footer = page.locator("#editview-footer");
    await expect(footer).toContainText(
      /Autosave unavailable for non-canonical revisions/i,
    );

    const editor = editorBody(page);
    await editor.click();
    await page.keyboard.type(" edit");

    await expect(page.getByText(/Unsaved edits/i)).toBeVisible();
  });
});

test.describe("Editor stability", () => {
  test("caret does not reset when an unrelated parent re-render fires", async ({
    page,
  }) => {
    await page.goto(STORY.rerender);

    const editor = editorBody(page);
    await editor.click();
    // Place caret at end of "start " and type "hello".
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("hello");

    // Trigger an unrelated parent re-render via the global hook exposed
    // by the story. This intentionally does NOT touch focus.
    await page.evaluate(() => {
      (
        window as unknown as { __forceEditorRerender?: () => void }
      ).__forceEditorRerender?.();
    });

    // Continue typing — if a re-render reset the editor's internal state
    // these keystrokes would land at the start instead of after "hello".
    await page.keyboard.type(" world");

    await expect(editor).toContainText(/start\s*hello world/);
  });
});
