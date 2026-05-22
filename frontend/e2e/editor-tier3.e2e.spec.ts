import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Tier-3 regression coverage for the editor.
 *
 * - Table insertion produces a 3x3 grid with a header row.
 * - The Table Operations toolbar group only renders when the cursor is
 *   inside a table; common row/column ops mutate the structure as expected.
 * - Paste from external sources strips inline color/background and stylesheet
 *   noise from table cells (covered by the NormalizePastedText / StripExternal
 *   PasteColor TipTap extensions).
 * - Font size, font family, and line height inputs each write to the
 *   active selection / paragraph.
 */

// Storybook + TipTap occasionally drop the first keystrokes after iframe
// reload under combined-suite load. A single retry absorbs the timing race
// without masking real bugs — a real regression would fail every retry.
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
  // Wait for TipTap's placeholder decoration so the editor is guaranteed
  // ready to receive keystrokes (without this, the first few characters
  // can be dropped against a still-initializing instance).
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
  if (text.length > 0) {
    await page.keyboard.type(text);
    // Self-heal against TipTap init races: wait until the typed text is
    // actually committed before continuing.
    await expect(editor).toContainText(text);
    await contentScope(page)
      .getByText(text, { exact: false })
      .first()
      .click({ clickCount: 3 });
  } else {
    await editor.click({ clickCount: 3 });
  }
}

async function clickToolbarButton(page: Page, name: string): Promise<void> {
  await page
    .getByRole("button", { name: new RegExp(`^${name}$`, "i") })
    .click();
}

test.describe("Tables", () => {
  test("Insert Table produces a 3x3 grid with a header row", async ({
    page,
  }) => {
    await prepareEditor(page);
    await clickToolbarButton(page, "Insert Table");

    const table = contentScope(page).locator("table");
    await expect(table).toBeVisible();

    // 3 rows total: one header (<th>) row + two body (<td>) rows.
    const rowCount = await table.locator("tr").count();
    expect(rowCount).toBe(3);

    const thCount = await table.locator("th").count();
    expect(thCount).toBe(3);

    const tdCount = await table.locator("td").count();
    expect(tdCount).toBe(6);
  });

  test("Table Operations group renders only while the cursor is inside a table", async ({
    page,
  }) => {
    await prepareEditor(page);

    const addRowBefore = page.getByRole("button", {
      name: /^Add Row Before$/i,
    });
    await expect(addRowBefore).toHaveCount(0);

    await clickToolbarButton(page, "Insert Table");
    // Click into a cell so the cursor is inside the table.
    await contentScope(page).locator("table td, table th").first().click();
    await expect(addRowBefore).toBeVisible();

    // Move the cursor below the table. TipTap auto-inserts a trailing
    // paragraph so users can escape; ArrowDown traversal lands the
    // cursor there and the contextual table-ops group should hide.
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press("ArrowDown");
    }
    await expect
      .poll(async () =>
        page.getByRole("button", { name: /^Add Row Before$/i }).count(),
      )
      .toBe(0);
  });

  test("Add Row After increases the row count", async ({ page }) => {
    await prepareEditor(page);
    await clickToolbarButton(page, "Insert Table");
    await contentScope(page).locator("table td, table th").first().click();

    const table = contentScope(page).locator("table");
    const before = await table.locator("tr").count();
    await clickToolbarButton(page, "Add Row After");
    await expect.poll(async () => table.locator("tr").count()).toBe(before + 1);
  });

  test("Delete Table removes the table from the document", async ({ page }) => {
    await prepareEditor(page);
    await clickToolbarButton(page, "Insert Table");
    await contentScope(page).locator("table td, table th").first().click();

    await clickToolbarButton(page, "Delete Table");
    await expect
      .poll(async () => contentScope(page).locator("table").count())
      .toBe(0);
  });
});

test.describe("Paste normalization", () => {
  /**
   * Dispatches a synthetic paste event carrying the given HTML on the
   * editor's contenteditable element. TipTap reads from clipboardData and
   * passes the HTML through its `transformPastedHTML` chain, so this
   * exercises the same code path as a real cross-origin paste.
   */
  async function pasteHtml(page: Page, html: string): Promise<void> {
    const editor = editorBody(page);
    await editor.click();
    await editor.evaluate((el, value) => {
      const data = new DataTransfer();
      data.setData("text/html", value);
      data.setData("text/plain", el.textContent ?? "");
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, html);
  }

  test("paste strips inline color and background-color", async ({ page }) => {
    await prepareEditor(page, "");
    await pasteHtml(
      page,
      '<p style="color: #ff0000; background-color: yellow;">Pasted text</p>',
    );

    // Text is preserved.
    await expect(contentScope(page)).toContainText("Pasted text");

    // No descendant carries an inline color or background-color.
    await expect
      .poll(async () =>
        contentScope(page)
          .locator('[style*="color"], [style*="background-color"]')
          .count(),
      )
      .toBe(0);
  });

  test("paste strips inline styles from table cells", async ({ page }) => {
    await prepareEditor(page, "");
    await pasteHtml(
      page,
      "<table><tbody>" +
        '<tr><td style="background-color: pink; color: blue;">A</td><td style="color: red;">B</td></tr>' +
        "</tbody></table>",
    );

    await expect(contentScope(page).locator("table")).toBeVisible();

    // No `td` or `th` carries any inline style attribute.
    await expect
      .poll(async () =>
        contentScope(page).locator("td[style], th[style]").count(),
      )
      .toBe(0);

    // bgcolor / width / height / align attributes are also stripped.
    await expect
      .poll(async () =>
        contentScope(page)
          .locator("[bgcolor], [width], [height], [align], [valign]")
          .count(),
      )
      .toBe(0);
  });
});

test.describe("Typography inputs", () => {
  test("Font Size input writes the chosen size to the selection", async ({
    page,
  }) => {
    await prepareEditor(page);
    const sizeInput = page.getByRole("spinbutton", { name: /Font Size/i });
    await sizeInput.fill("22");
    // The schema sends the new size via setFontSize on input change.
    await sizeInput.press("Tab");

    await expect
      .poll(async () =>
        contentScope(page).locator('span[style*="font-size: 22px"]').count(),
      )
      .toBeGreaterThan(0);
  });

  test("Font Family selector applies the chosen family to the selection", async ({
    page,
  }) => {
    await prepareEditor(page);
    const familySelect = page.getByRole("combobox", { name: /Font Family/i });

    await familySelect.selectOption("Merriweather");

    await expect
      .poll(async () =>
        contentScope(page).locator('span[style*="font-family"]').count(),
      )
      .toBeGreaterThan(0);

    // The actual family name should be present in the inline style.
    const fontFamilyValues = await contentScope(page)
      .locator('span[style*="font-family"]')
      .evaluateAll((elements) =>
        elements.map((el) => (el as HTMLElement).style.fontFamily ?? ""),
      );
    expect(fontFamilyValues.some((value) => /merriweather/i.test(value))).toBe(
      true,
    );
  });

  test("Line Height input writes line-height to the active paragraph", async ({
    page,
  }) => {
    await prepareEditor(page);
    const lineHeight = page.getByRole("spinbutton", { name: /Line Height/i });
    await lineHeight.fill("2");
    await lineHeight.press("Tab");

    // GetWriteParagraphLeading renders the chosen value as inline
    // `style="line-height: <n>"` on the paragraph element.
    await expect
      .poll(async () =>
        contentScope(page)
          .locator("p")
          .first()
          .evaluate((el) => (el as HTMLElement).style.lineHeight),
      )
      .toMatch(/^2/);
  });
});
