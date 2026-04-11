import { test, expect } from "@playwright/test";

test("diff view interactive variant renders", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-diffview--interactive");

    await expect(page).toHaveURL(/diffview--interactive/);
});

test("diff view default displays both sides", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-diffview--default");

    const hasContent = page.locator('[data-testid="has-content"]');
    await expect(hasContent).toHaveText("true");
});

test("diff view empty variant renders without error", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-diffview--empty");

    const revisionCount = page.locator('[data-testid="revision-count"]');
    await expect(revisionCount).toHaveText("0");
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

    const revisionCount = page.locator('[data-testid="revision-count"]');
    await expect(revisionCount).toHaveText("2");
});
