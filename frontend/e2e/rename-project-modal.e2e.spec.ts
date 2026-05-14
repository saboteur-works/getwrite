import { test, expect } from "@playwright/test";

test("rename project modal interactive variant opens", async ({ page }) => {
    await page.goto("/iframe.html?id=start-renameprojectmodal--interactive");

    const isOpenProbe = page.locator('[data-testid="is-open"]');
    await expect(isOpenProbe).toHaveText("true");
});

test("rename project modal interactive tracks rename", async ({ page }) => {
    await page.goto("/iframe.html?id=start-renameprojectmodal--interactive");

    const nameInput = page.locator("input").first();
    const lastRenameProbe = page.locator('[data-testid="last-rename"]');

    await expect(nameInput).toBeVisible();
    await nameInput.fill("New Project Name");

    const saveButton = page.getByRole("button", { name: /save/i });
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    await expect(lastRenameProbe).toHaveText("New Project Name", {
        timeout: 1000,
    });
});

test("rename project modal interactive tracks open state", async ({ page }) => {
    await page.goto("/iframe.html?id=start-renameprojectmodal--interactive");

    const isOpenProbe = page.locator('[data-testid="is-open"]');
    await expect(isOpenProbe).toHaveText("true");

    const cancelButton = page.getByRole("button", { name: /cancel/i });
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await expect(isOpenProbe).toHaveText("false", { timeout: 1000 });
});

test(
    "rename project modal closes on escape",
    async ({ page }) => {
        await page.goto("/iframe.html?id=start-renameprojectmodal--interactive");
        const isOpenProbe = page.locator('[data-testid="is-open"]');
        await expect(isOpenProbe).toHaveText("true");
        await page.keyboard.press("Escape");
        await expect(isOpenProbe).toHaveText("false", { timeout: 1000 });
    },
);

test(
    "rename project modal allows keyboard submit",
    async ({ page }) => {
        await page.goto("/iframe.html?id=start-renameprojectmodal--interactive");
        const nameInput = page.locator('input[type="text"], input').first();
        const lastRenameProbe = page.locator('[data-testid="last-rename"]');
        await expect(nameInput).toBeVisible();
        await nameInput.fill("Keyboard Submitted Name");
        await nameInput.press("Enter");
        await expect(lastRenameProbe).toHaveText("Keyboard Submitted Name", {
            timeout: 1000,
        });
    },
);
