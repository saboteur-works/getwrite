import { test, expect } from "@playwright/test";

/**
 * E2E coverage for the Markdown source-toggle UI, driven against the Storybook
 * stories (the real ProseMirror editor cannot mount under the unit harness, so
 * the presentational layer — the "Edit as Markdown" warning modal and the raw
 * source view — is exercised here instead).
 */

const WARNING_MODAL =
  "/iframe.html?id=editor-markdownswitchwarningmodal--interactive";
const SOURCE_VIEW = "/iframe.html?id=editor-markdownsourceview--interactive";

test.describe("Edit-as-Markdown warning modal", () => {
  test("opens with the one-way conversion warning", async ({ page }) => {
    await page.goto(WARNING_MODAL);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      /converts this document to github-flavored markdown/i,
    );
  });

  test("exhaustively lists formatting that will be removed", async ({
    page,
  }) => {
    await page.goto(WARNING_MODAL);

    const dialog = page.getByRole("dialog");
    // Constructs the per-document detector does NOT catch must still be listed.
    await expect(dialog).toContainText(/Text alignment/i);
    await expect(dialog).toContainText(/Paragraph line spacing/i);
  });

  test("calls out lossy constructs found in the current document", async ({
    page,
  }) => {
    await page.goto(WARNING_MODAL);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(/Found in this document/i);
  });

  test("confirms the switch to source editing", async ({ page }) => {
    await page.goto(WARNING_MODAL);

    await page.getByRole("button", { name: /edit as markdown/i }).click();

    await expect(page.locator('[data-testid="last-action"]')).toHaveText(
      "confirmed",
      { timeout: 1000 },
    );
    await expect(page.locator('[data-testid="is-open"]')).toHaveText("false");
  });

  test("cancels and stays in rich text", async ({ page }) => {
    await page.goto(WARNING_MODAL);

    await page.getByRole("button", { name: /cancel/i }).click();

    await expect(page.locator('[data-testid="last-action"]')).toHaveText(
      "canceled",
      { timeout: 1000 },
    );
  });

  test("closes on escape", async ({ page }) => {
    await page.goto(WARNING_MODAL);

    await expect(page.locator('[data-testid="is-open"]')).toHaveText("true");
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="is-open"]')).toHaveText("false", {
      timeout: 1000,
    });
  });
});

test.describe("Markdown source view", () => {
  test("shows the serialized Markdown in an editable textarea", async ({
    page,
  }) => {
    await page.goto(SOURCE_VIEW);

    const textarea = page.getByLabel(/markdown source/i);
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue(/Chapter One/);
  });

  test("reflects edits to the source", async ({ page }) => {
    await page.goto(SOURCE_VIEW);

    const textarea = page.getByLabel(/markdown source/i);
    await textarea.fill("## Edited heading");
    await expect(textarea).toHaveValue("## Edited heading");
  });

  test("returns to rich text via the toggle", async ({ page }) => {
    await page.goto(SOURCE_VIEW);

    await page.getByRole("button", { name: /rich text/i }).click();
    await expect(page.locator('[data-testid="last-action"]')).toHaveText(
      "exit",
      { timeout: 1000 },
    );
  });
});
