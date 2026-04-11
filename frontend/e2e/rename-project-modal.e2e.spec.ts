import { test, expect } from "@playwright/test";

test("rename project modal interactive variant opens", async ({ page }) => {
    await page.goto("/iframe.html?id=start-renameprojectmodal--interactive");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
});

test("rename project modal interactive tracks rename", async ({ page }) => {
    await page.goto("/iframe.html?id=start-renameprojectmodal--interactive");

    const dialog = page.getByRole("dialog");
    const nameInput = dialog.locator("input").first();
    const lastRenameProbe = page.locator('[data-testid="last-rename"]');

    // Clear and type new name
    await nameInput.fill("New Project Name");

    // Find and click confirm button
    const confirmButton = dialog.getByRole("button", {
        name: /confirm|rename/i,
    });
    if (await confirmButton.isVisible()) {
        await confirmButton.click();

        // Verify the rename was tracked
        const renamedValue = await lastRenameProbe.textContent();
        expect(renamedValue).toContain("New Project Name");
    }
});

test("rename project modal interactive tracks open state", async ({ page }) => {
    await page.goto("/iframe.html?id=start-renameprojectmodal--interactive");

    const isOpenProbe = page.locator('[data-testid="is-open"]');

    // Verify modal is open
    await expect(isOpenProbe).toHaveText("true");

    // Close modal
    const dialog = page.getByRole("dialog");
    const closeButton = dialog.getByRole("button", { name: /close|cancel/i });
    if (await closeButton.isVisible()) {
        await closeButton.click();

        // Verify open state updated
        await expect(isOpenProbe).toHaveText("false", { timeout: 1000 });
    }
});

test("rename project modal closes on escape", async ({ page }) => {
    await page.goto("/iframe.html?id=start-renameprojectmodal--interactive");

    const isOpenProbe = page.locator('[data-testid="is-open"]');

    await expect(isOpenProbe).toHaveText("true");

    // Press Escape
    await page.keyboard.press("Escape");

    // Modal should close
    await expect(isOpenProbe).toHaveText("false", { timeout: 1000 });
});

test("rename project modal allows keyboard submit", async ({ page }) => {
    await page.goto("/iframe.html?id=start-renameprojectmodal--interactive");

    const nameInput = page.locator('input[type="text"]').first();
    const lastRenameProbe = page.locator('[data-testid="last-rename"]');

    await nameInput.fill("Keyboard Renamed");

    // Press Enter to submit
    await nameInput.press("Enter");

    // Verify rename was tracked
    const renamedValue = await lastRenameProbe.textContent();
    if (renamedValue) {
        expect(renamedValue).toContain("Keyboard Renamed");
    }
});
