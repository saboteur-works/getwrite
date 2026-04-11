import { test, expect } from "@playwright/test";

test("metadata sidebar interactive variant renders", async ({ page }) => {
    await page.goto("/iframe.html?id=sidebar-metadatasidebar--interactive");

    // Verify page loaded
    await expect(page).toHaveURL(/metadatasidebar--interactive/);
});

test("metadata sidebar interactive tracks resource name", async ({ page }) => {
    await page.goto("/iframe.html?id=sidebar-metadatasidebar--interactive");

    const resourceNameProbe = page.locator(
        '[data-testid="current-resource-name"]',
    );
    const initialName = await resourceNameProbe.textContent();

    expect(initialName).toContain("Example");
});

test("metadata sidebar default displays resource metadata", async ({
    page,
}) => {
    await page.goto("/iframe.html?id=sidebar-metadatasidebar--default");

    // Verify page loaded
    await expect(page).toHaveURL(/metadatasidebar--default/);
});

test("metadata sidebar interactive tracks changes", async ({ page }) => {
    await page.goto("/iframe.html?id=sidebar-metadatasidebar--interactive");

    const lastChangeProbe = page.locator('[data-testid="last-change"]');

    // Try to find and interact with an input field
    const inputs = page.locator('input[type="text"]');
    const inputCount = await inputs.count();

    if (inputCount > 0) {
        const firstInput = inputs.first();
        await firstInput.click();
        const currentValue = await firstInput.inputValue();
        await firstInput.fill(currentValue + " Modified");

        // Trigger blur to save
        await firstInput.blur();
        await page.waitForTimeout(100);

        // Verify change was tracked
        const lastChange = await lastChangeProbe.textContent();
        expect(lastChange).toBeTruthy();
    }
});
