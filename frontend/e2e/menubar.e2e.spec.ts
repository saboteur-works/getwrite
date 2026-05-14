import { test, expect } from "@playwright/test";

test("menubar renders with default state", async ({ page }) => {
    await page.goto("/iframe.html?id=editor-menubar-menubar--default");

    const editorLoaded = page.locator('[data-testid="editor-loaded"]');
    await expect(editorLoaded).toHaveText("true");
});

test("menubar interactive variant tracks last action", async ({ page }) => {
    await page.goto("/iframe.html?id=editor-menubar-menubar--interactive");

    const boldButton = page.getByRole("button", { name: /bold|b/i }).first();
    await expect(boldButton).toBeVisible();

    // Click twice: the story's proxy reads actions on the *next* chain() call,
    // so a second click is needed to see the first click's recorded action.
    await boldButton.click();
    await boldButton.click();

    const actionCount = page.locator('[data-testid="action-count"]');
    const countText = await actionCount.textContent();
    expect(parseInt(countText ?? "0", 10)).toBeGreaterThan(0);
});

test("menubar tracks multiple formatting actions", async ({ page }) => {
    await page.goto("/iframe.html?id=editor-menubar-menubar--interactive");

    const actionCount = page.locator('[data-testid="action-count"]');
    const boldButton = page.getByRole("button", { name: /bold|b/i }).first();

    await expect(boldButton).toBeVisible();

    await boldButton.click();
    await boldButton.click();

    const countText = await actionCount.textContent();
    expect(parseInt(countText ?? "0", 10)).toBeGreaterThan(0);
});
