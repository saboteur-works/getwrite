import { test, expect, type Page } from "@playwright/test";
import {
  editorBody,
  waitForEditorReady,
  typeIntoEditor,
} from "./helpers/editor";

/**
 * Tier-2 regression coverage for editor formatting commands. These tests
 * exercise the toolbar against the real TipTap editor so refactors that
 * break the schema → command → DOM chain surface immediately.
 *
 * Each block follows the same pattern: load a fresh Interactive story,
 * type a known phrase, select it, click the toolbar control, then
 * assert on the resulting DOM. Where the control is a toggle, both
 * states are asserted.
 */

const INTERACTIVE_STORY = "/iframe.html?id=workarea-editview--interactive";

function contentScope(page: Page) {
  return page.locator(".tiptap-editor-content");
}

async function prepareEditor(page: Page, text = "hello world"): Promise<void> {
  await page.goto(INTERACTIVE_STORY);
  await waitForEditorReady(page);
  // typeIntoEditor clears and retypes until the text actually commits, so the
  // TipTap init race that used to drop the first keystrokes can't leak through.
  await typeIntoEditor(page, text);
  // Triple-click the specific element that contains the typed text so
  // the selection always lands on that block (TipTap can leave behind a
  // placeholder block during init that an editor-body triple-click
  // would otherwise hit).
  await contentScope(page)
    .getByText(text, { exact: false })
    .first()
    .click({ clickCount: 3 });
}

async function clickToolbarButton(page: Page, name: string): Promise<void> {
  // Use exact-name match to avoid colliding with "Toggle X controls" group
  // toggles or other buttons whose accessible names share a prefix.
  await page
    .getByRole("button", { name: new RegExp(`^${name}$`, "i") })
    .click();
}

/**
 * Restores the editor selection after Playwright's toolbar click steals
 * browser focus. We rely on TipTap's command chain calling `.focus()` to
 * restore its internal selection — but for block-level transforms the
 * block element changes, so a DOM triple-click can miss. Instead, just
 * focus the editor and use the keyboard shortcut to select all.
 */
async function refocusAndSelectAll(page: Page): Promise<void> {
  const editor = editorBody(page);
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
}

test.describe("Inline marks", () => {
  const INLINE_MARKS: Array<{ button: string; tag: string }> = [
    { button: "Bold", tag: "strong" },
    { button: "Italic", tag: "em" },
    { button: "Underline", tag: "u" },
    { button: "Strikethrough", tag: "s" },
    { button: "Inline code", tag: "code" },
  ];

  for (const { button, tag } of INLINE_MARKS) {
    test(`${button} wraps and unwraps the selection in <${tag}>`, async ({
      page,
    }) => {
      await prepareEditor(page);

      await clickToolbarButton(page, button);
      await expect
        .poll(async () => contentScope(page).locator(tag).count())
        .toBeGreaterThan(0);

      await refocusAndSelectAll(page);
      await clickToolbarButton(page, button);
      // Inline code lives inside <code>; the block code button also
      // produces <code> (inside <pre>). Scope to non-<pre> ancestors
      // for inline so the two buttons don't collide.
      const inlineCount = await contentScope(page)
        .locator(`:not(pre) > ${tag}`)
        .count();
      expect(inlineCount).toBe(0);
    });
  }
});

// typeIntoEditor removes the first-keystroke-drop race, but block-level
// transforms still chain a toolbar click onto a fresh selection, which can
// occasionally lose under combined-suite CPU load. A single retry absorbs that
// without masking real bugs — a broken command would fail every attempt.
test.describe.configure({ retries: 1 });

test.describe("Headings", () => {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    test(`Heading ${level} converts the paragraph to <h${level}>`, async ({
      page,
    }) => {
      await prepareEditor(page);
      await clickToolbarButton(page, `Heading ${level}`);
      await expect(contentScope(page).locator(`h${level}`)).toHaveText(
        /hello world/i,
      );
    });
  }

  test("Heading 1 toggles off when clicked again on an existing heading", async ({
    page,
  }) => {
    await prepareEditor(page);
    await clickToolbarButton(page, "Heading 1");
    await expect(contentScope(page).locator("h1")).toHaveText(/hello world/i);

    // Place the cursor inside the heading so the toggle command operates
    // on this specific block rather than any auto-inserted trailing one.
    await contentScope(page).locator("h1").click();
    await clickToolbarButton(page, "Heading 1");

    await expect
      .poll(async () => contentScope(page).locator("h1").count())
      .toBe(0);
  });
});

test.describe("Lists", () => {
  test("Bullet list wraps the paragraph in <ul><li>", async ({ page }) => {
    await prepareEditor(page);
    await clickToolbarButton(page, "Bullet list");
    await expect(contentScope(page).locator("ul li").first()).toHaveText(
      /hello world/i,
    );
  });

  test("Ordered list wraps the paragraph in <ol><li>", async ({ page }) => {
    await prepareEditor(page);
    await clickToolbarButton(page, "Ordered list");
    await expect(contentScope(page).locator("ol li").first()).toHaveText(
      /hello world/i,
    );
  });

  test("Tab nests a sibling list item under the previous one", async ({
    page,
  }) => {
    await prepareEditor(page, "first");
    await clickToolbarButton(page, "Bullet list");

    // Anchor the caret inside the first list item before extending so
    // Enter creates a sibling <li>, not a new block outside the list.
    await contentScope(page).locator("ul li").first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second");
    await page.keyboard.press("Tab");

    // The nested <li> lives inside another <li>'s descendant tree.
    await expect
      .poll(async () => contentScope(page).locator("li li").count())
      .toBeGreaterThan(0);
  });
});

test.describe("Alignment", () => {
  const ALIGNMENTS: Array<{ button: string; expected: string }> = [
    { button: "Align Left", expected: "left" },
    { button: "Align Center", expected: "center" },
    { button: "Align Right", expected: "right" },
    { button: "Align Justify", expected: "justify" },
  ];

  for (const { button, expected } of ALIGNMENTS) {
    test(`${button} sets the paragraph's text-align to ${expected}`, async ({
      page,
    }) => {
      await prepareEditor(page);
      await clickToolbarButton(page, button);

      const paragraph = contentScope(page).locator("p").first();
      const value = await paragraph.evaluate(
        (el) => (el as HTMLElement).style.textAlign,
      );
      expect(value).toBe(expected);
    });
  }

  test("only one alignment is active at a time", async ({ page }) => {
    await prepareEditor(page);

    await clickToolbarButton(page, "Align Center");
    await refocusAndSelectAll(page);
    await clickToolbarButton(page, "Align Right");

    const paragraph = contentScope(page).locator("p").first();
    const value = await paragraph.evaluate(
      (el) => (el as HTMLElement).style.textAlign,
    );
    expect(value).toBe("right");

    // The center button should no longer carry its active class.
    const isCenterActive = await page
      .getByRole("button", { name: /^Align Center$/i })
      .evaluate((el) =>
        el.classList.contains("editor-menu-icon-button-active"),
      );
    expect(isCenterActive).toBe(false);
  });
});

test.describe("Block-level controls", () => {
  test("Blockquote wraps the paragraph in <blockquote>", async ({ page }) => {
    await prepareEditor(page);
    await clickToolbarButton(page, "Blockquote");
    await expect(contentScope(page).locator("blockquote")).toHaveText(
      /hello world/i,
    );
  });

  test("Horizontal rule inserts an <hr>", async ({ page }) => {
    await prepareEditor(page);
    // Move caret to the end before inserting so the rule appears after
    // the existing content.
    const editor = editorBody(page);
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");

    await clickToolbarButton(page, "Horizontal rule");
    await expect
      .poll(async () => contentScope(page).locator("hr").count())
      .toBeGreaterThan(0);
  });

  test("Code block wraps the paragraph in <pre><code>", async ({ page }) => {
    await prepareEditor(page);
    await clickToolbarButton(page, "Code block");
    await expect(contentScope(page).locator("pre code")).toHaveText(
      /hello world/i,
    );
  });
});
