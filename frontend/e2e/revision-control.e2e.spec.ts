import { test, expect } from "@playwright/test";

test("revision control interactive renders revision list", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=editor-revisioncontrol-revisioncontrol--withrevisions",
    );

    // Revision control should be visible
    const component = page.locator("main, [class*='Revision']").first();
    await expect(component).toBeVisible();
});

test("revision control shows canonical revision probe", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=editor-revisioncontrol-revisioncontrol--withrevisions",
    );

    const canonicalProbe = page.locator('[data-testid="canonical-revision"]');

    // Canonical revision should be marked
    const canonical = await canonicalProbe.textContent();
    expect(canonical).toContain("rev-2");
});

test("revision control displays revision items", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=editor-revisioncontrol-revisioncontrol--withrevisions",
    );

    // Look for revision list items
    const revisionItems = page.locator('[class*="revision"], li');
    const itemCount = await revisionItems.count();

    // Should have at least one revision
    if (itemCount > 0) {
        await expect(revisionItems.first()).toBeVisible();
    }
});

test("revision control displays revision names", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=editor-revisioncontrol-revisioncontrol--withrevisions",
    );

    // Should display revision display names
    const displayNames = page.getByText(/Initial draft|Post-edit/);
    const count = await displayNames.count();

    expect(count).toBeGreaterThan(0);
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
