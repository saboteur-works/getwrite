import { test, expect } from "@playwright/test";

const SWITCHING_STORY = "/iframe.html?id=workarea-editview--resource-switching";
const BODY_CONFIG_STORY =
  "/iframe.html?id=workarea-editview--with-editor-body-config";
const CANONICAL_STORY =
  "/iframe.html?id=workarea-editview--with-canonical-revision";
const NON_CANONICAL_STORY =
  "/iframe.html?id=workarea-editview--with-non-canonical-revision";

test.describe("Editor resource switching", () => {
  test("initial selection renders the alpha resource", async ({ page }) => {
    await page.goto(SWITCHING_STORY);

    const editor = page
      .locator('[role="textbox"], [contenteditable="true"]')
      .first();
    await expect(editor).toContainText(/alpha document body/i);

    const header = page.locator("h2").filter({ hasText: "Alpha Resource" });
    await expect(header).toBeVisible();
  });

  test("switching to beta swaps editor content and title", async ({ page }) => {
    await page.goto(SWITCHING_STORY);

    await page.locator('[data-testid="switch-res-beta"]').click();

    await expect(page.locator('[data-testid="active-resource-id"]')).toHaveText(
      "res-beta",
    );

    const editor = page
      .locator('[role="textbox"], [contenteditable="true"]')
      .first();
    await expect(editor).toContainText(/beta document body/i);
    await expect(editor).not.toContainText(/alpha document body/i);

    await expect(
      page.locator("h2").filter({ hasText: "Beta Resource" }),
    ).toBeVisible();
  });

  test("switching back to alpha restores the original content", async ({
    page,
  }) => {
    await page.goto(SWITCHING_STORY);

    await page.locator('[data-testid="switch-res-beta"]').click();
    await expect(
      page.locator('[role="textbox"], [contenteditable="true"]').first(),
    ).toContainText(/beta document body/i);

    await page.locator('[data-testid="switch-res-alpha"]').click();

    await expect(page.locator('[data-testid="active-resource-id"]')).toHaveText(
      "res-alpha",
    );
    const editor = page
      .locator('[role="textbox"], [contenteditable="true"]')
      .first();
    await expect(editor).toContainText(/alpha document body/i);
    await expect(editor).not.toContainText(/beta document body/i);
  });
});

test.describe("Editor body config", () => {
  test("body config propagates to editor shell as CSS variables", async ({
    page,
  }) => {
    await page.goto(BODY_CONFIG_STORY);

    const shell = page.locator(".tiptap-editor-shell").first();
    await expect(shell).toBeVisible();

    const style = await shell.getAttribute("style");
    expect(style).toContain("--gw-body-font-family: Georgia, serif");
    expect(style).toContain("--gw-body-font-size: 18px");
    expect(style).toContain("--gw-body-line-height: 2.1");
    expect(style).toContain("--gw-paragraph-spacing: 1.4em");
  });
});

test.describe("Editor document header", () => {
  test("canonical revision shows the seeded resource name", async ({
    page,
  }) => {
    await page.goto(CANONICAL_STORY);

    await expect(page.locator("h2").filter({ hasText: "Draft" })).toBeVisible();
    await expect(page.getByText(/editing canonical revision/i)).toBeVisible();
  });

  test("non-canonical revision shows previous-revision subtitle", async ({
    page,
  }) => {
    await page.goto(NON_CANONICAL_STORY);

    await expect(page.locator("h2").filter({ hasText: "Draft" })).toBeVisible();
    await expect(page.getByText(/viewing a previous revision/i)).toBeVisible();
  });
});
