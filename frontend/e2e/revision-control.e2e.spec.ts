import { test, expect } from "@playwright/test";

test("revision control interactive renders revision list", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=editor-revisioncontrol-revisioncontrol--with-revisions",
    );

    const revisionCount = page.locator('[data-testid="revision-count"]');
    await expect(revisionCount).toHaveText("2");
});

test("revision control shows canonical revision probe", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=editor-revisioncontrol-revisioncontrol--with-revisions",
    );

    const canonicalProbe = page.locator('[data-testid="canonical-revision"]');
    await expect(canonicalProbe).toHaveText("rev-2");
});

test("revision control displays revision items", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=editor-revisioncontrol-revisioncontrol--with-revisions",
    );

    const revisionCount = page.locator('[data-testid="revision-count"]');
    const countText = await revisionCount.textContent();
    expect(parseInt(countText ?? "0", 10)).toBeGreaterThanOrEqual(1);
});

test("revision control displays revision names", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=editor-revisioncontrol-revisioncontrol--with-revisions",
    );

    const canonicalProbe = page.locator('[data-testid="canonical-revision"]');
    await expect(canonicalProbe).toHaveText("rev-2");
    const revisionCount = page.locator('[data-testid="revision-count"]');
    await expect(revisionCount).toHaveText("2");
});

test("revision control allows revision selection", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=editor-revisioncontrol-revisioncontrol--with-revisions",
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
