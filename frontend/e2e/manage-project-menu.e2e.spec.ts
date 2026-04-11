import { test, expect } from "@playwright/test";

test("manage project menu interactive renders menu items", async ({ page }) => {
    await page.goto("/iframe.html?id=start-manageprojectmenu--interactive");

    // Menu should have buttons for actions
    const buttons = page.locator("button");
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(0);
});

test("manage project menu interactive tracks last action", async ({ page }) => {
    await page.goto("/iframe.html?id=start-manageprojectmenu--interactive");

    const lastActionProbe = page.locator('[data-testid="last-action"]');
    const actionPayloadProbe = page.locator('[data-testid="action-payload"]');

    // Click delete action (if available)
    const deleteButton = page.getByRole("button", { name: /delete/i });
    if (await deleteButton.isVisible()) {
        await deleteButton.click();

        // Verify action was tracked
        const action = await lastActionProbe.textContent();
        expect(action).toContain("delete");
    }
});

test("manage project menu interactive tracks rename action", async ({
    page,
}) => {
    await page.goto("/iframe.html?id=start-manageprojectmenu--interactive");

    const lastActionProbe = page.locator('[data-testid="last-action"]');

    // Click rename action (if available)
    const renameButton = page.getByRole("button", { name: /rename/i });
    if (await renameButton.isVisible()) {
        await renameButton.click();

        // Verify action was tracked
        const action = await lastActionProbe.textContent();
        expect(action).toContain("rename");
    }
});

test("manage project menu records action payload", async ({ page }) => {
    await page.goto("/iframe.html?id=start-manageprojectmenu--interactive");

    const actionPayloadProbe = page.locator('[data-testid="action-payload"]');

    // Click any action button
    const actionButton = page.locator("button").nth(1);
    if (await actionButton.isVisible()) {
        await actionButton.click();
        await page.waitForTimeout(100);

        // Payload should contain project ID
        const payload = await actionPayloadProbe.textContent();
        expect(payload).toBeTruthy();
    }
});
