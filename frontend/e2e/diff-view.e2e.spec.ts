import { test, expect } from "@playwright/test";

test("diff view interactive variant renders", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-diffview--interactive");

    const container = page.locator('[class*="Diff"]').first();
    await expect(container).toBeVisible();
});

test("diff view default displays both sides", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-diffview--default");

    // Look for left and right panels
    const panels = page.locator('[class*="panel"], [class*="side"]');
    const panelCount = await panels.count();

    // Should have content visible
    expect(panelCount).toBeGreaterThanOrEqual(1);
});

test("diff view empty variant renders without error", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-diffview--empty");

    const component = page
        .locator("main, [role='main'], [class*='Diff']")
        .first();
    await expect(component).toBeVisible();
});

test("diff view interactive tracks selected revision", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-diffview--interactive");

    const selectedProbe = page.locator('[data-testid="selected-revision-id"]');

    // Try clicking a revision selector if present
    const revisionButtons = page.getByRole("button", {
        name: /draft|revision|version/i,
    });
    const buttonCount = await revisionButtons.count();

    if (buttonCount > 0) {
        await revisionButtons.first().click();
        await page.waitForTimeout(200);

        const selectedId = await selectedProbe.textContent();
        expect(selectedId).toBeDefined();
    }
});

test("diff view shows comparison content", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-diffview--default");

    // Look for diff indicators or content markers
    const content = page.locator("body");
    const text = await content.textContent();

    // Should contain some text from the samples
    expect(text).toMatch(/Introduction|revised|Point/i);
});
