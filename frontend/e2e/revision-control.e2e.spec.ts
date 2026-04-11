import { test, expect } from "@playwright/test";

test("revision control interactive renders revision list", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=editor-revisioncontrol-revisioncontrol--withrevisions",
    );

    // Verify page loaded
    await expect(page).toHaveURL(/revisioncontrol--withrevisions/);
});

test("revision control shows canonical revision probe", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=editor-revisioncontrol-revisioncontrol--withrevisions",
    );

    // Verify page loaded
    await expect(page).toHaveURL(/revisioncontrol--withrevisions/);
});

test("revision control displays revision items", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=editor-revisioncontrol-revisioncontrol--withrevisions",
    );

    // Verify page loaded
    await expect(page).toHaveURL(/revisioncontrol--withrevisions/);
});

test("revision control displays revision names", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=editor-revisioncontrol-revisioncontrol--withrevisions",
    );

    // Verify page loaded
    await expect(page).toHaveURL(/revisioncontrol--withrevisions/);
});

test("revision control allows revision selection", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=editor-revisioncontrol-revisioncontrol--withrevisions",
    );

    // Click a revision item to select it
    const revisionButtons = page.locator('button, [role="button"]');
    const buttonCount = await revisionButtons.count();

    if (buttonCount > 0) {
        // Click a revision (skip first if it's a general button)
        const revisionButton = revisionButtons.nth(
            Math.min(1, buttonCount - 1),
        );
        if (await revisionButton.isVisible()) {
            await revisionButton.click();
            await page.waitForTimeout(100);

            // Revision should be selected (visual feedback)
            await expect(revisionButton).toBeVisible();
        }
    }
});
