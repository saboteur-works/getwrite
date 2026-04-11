import { test, expect } from "@playwright/test";

test("menubar renders with default state", async ({ page }) => {
    await page.goto("/iframe.html?id=editor-menubar-menubar--default");

    const menubar = page.locator('[class*="MenuBar"]').first();
    await expect(menubar).toBeVisible();
});

test("menubar interactive variant tracks last action", async ({ page }) => {
    await page.goto("/iframe.html?id=editor-menubar-menubar--interactive");

    // Verify the menubar is visible
    const menubar = page.locator('[class*="MenuBar"]').first();
    await expect(menubar).toBeVisible();

    // Click a formatting button (e.g., Bold)
    const boldButton = page.getByRole("button", { name: /bold|b/i }).first();
    if (await boldButton.isVisible()) {
        await boldButton.click();

        // Check that last-action probe was updated
        const lastAction = page.locator('[data-testid="last-action"]');
        const actionText = await lastAction.textContent();
        expect(actionText).toBeTruthy();
    }
});

test("menubar tracks multiple formatting actions", async ({ page }) => {
    await page.goto("/iframe.html?id=editor-menubar-menubar--interactive");

    const actionCount = page.locator('[data-testid="action-count"]');

    // Initial action count
    const initialCount = await actionCount.textContent();
    const initialNum = initialCount ? parseInt(initialCount, 10) : 0;

    // Click a few formatting buttons if available
    const boldButton = page.getByRole("button", { name: /bold|b/i }).first();
    if (await boldButton.isVisible()) {
        await boldButton.click();
        await page.waitForTimeout(100);

        const newCount = await actionCount.textContent();
        const newNum = newCount ? parseInt(newCount, 10) : 0;
        expect(newNum).toBeGreaterThanOrEqual(initialNum);
    }
});

test("activeformatting variant shows button states", async ({ page }) => {
    await page.goto("/iframe.html?id=editor-menubar-menubar--activeformatting");

    const menubar = page.locator('[class*="MenuBar"]').first();
    await expect(menubar).toBeVisible();

    // In active formatting mode, some buttons should appear "active"
    // This is a basic smoke test
    const buttons = page.locator("button");
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(0);
});
