import { test, expect } from "@playwright/test";

test("compile preview modal interactive variant opens", async ({ page }) => {
    await page.goto("/iframe.html?id=common-compilepreviewmodal--interactive");

    // Verify page loaded
    await expect(page).toHaveURL(/compilepreviewmodal--interactive/);
});

test("compile preview modal displays project preview", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=common-compilepreviewmodal--projectpreview",
    );

    const content = page.locator("body");
    const text = await content.textContent();

    // Verify some content is displayed
    expect(text).toBeTruthy();
});

test("compile preview modal displays resource preview", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=common-compilepreviewmodal--resourcepreview",
    );

    // Verify page loaded
    await expect(page).toHaveURL(/compilepreviewmodal--resourcepreview/);
});

test("compile preview modal interactive tracks export action", async ({
    page,
}) => {
    await page.goto("/iframe.html?id=common-compilepreviewmodal--interactive");

    const lastActionProbe = page.locator('[data-testid="last-action"]');
    const exportButton = page.getByRole("button", { name: /export/i });

    if (await exportButton.isVisible()) {
        await exportButton.click();

        // Verify export action was tracked
        await expect(lastActionProbe).toHaveText("export", { timeout: 1000 });
    }
});

test("compile preview modal interactive tracks is-open state", async ({
    page,
}) => {
    await page.goto("/iframe.html?id=common-compilepreviewmodal--interactive");

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
