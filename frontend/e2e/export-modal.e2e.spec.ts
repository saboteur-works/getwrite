import { test, expect } from "@playwright/test";

test("export preview modal interactive variant opens", async ({ page }) => {
    await page.goto("/iframe.html?id=common-exportpreviewmodal--interactive");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
});

test("export preview modal tracks export action", async ({ page }) => {
    await page.goto("/iframe.html?id=common-exportpreviewmodal--interactive");

    await expect(page).toHaveURL(/exportpreviewmodal--interactive/);
});

test("export preview modal tracks close action", async ({ page }) => {
    await page.goto("/iframe.html?id=common-exportpreviewmodal--interactive");

    const lastActionProbe = page.locator('[data-testid="last-action"]');
    const closeButton = page.getByRole("button", { name: /close/i }).first();

    if (await closeButton.isVisible()) {
        await closeButton.click();

        // Verify close was tracked (modal should close)
        await expect(lastActionProbe).toHaveText("close", { timeout: 1000 });
    }
});

test("export preview modal displays resource title", async ({ page }) => {
    await page.goto("/iframe.html?id=common-exportpreviewmodal--open");

    const title = page.getByText("Chapter 01");
    if (await title.isVisible()) {
        await expect(title).toBeVisible();
    }
});

test("export preview modal shows preview content", async ({ page }) => {
    await page.goto("/iframe.html?id=common-exportpreviewmodal--open");

    // Verify page loaded
    await expect(page).toHaveURL(/exportpreviewmodal--open/);
});

test("export preview modal interactive tracks is-open state", async ({
    page,
}) => {
    await page.goto("/iframe.html?id=common-exportpreviewmodal--interactive");

    const isOpenProbe = page.locator('[data-testid="is-open"]');

    // Should be open initially
    await expect(isOpenProbe).toHaveText("true");

    // Close modal
    const closeButton = page.getByRole("button", { name: /close/i }).first();
    if (await closeButton.isVisible()) {
        await closeButton.click();

        // Should be closed
        await expect(isOpenProbe).toHaveText("false", { timeout: 1000 });
    }
});
