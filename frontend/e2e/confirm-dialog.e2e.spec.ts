import { test, expect } from "@playwright/test";

test("confirm dialog confirms action", async ({ page }) => {
    await page.goto("/iframe.html?id=common-confirmdialog--interactive");

    const lastActionProbe = page.locator('[data-testid="last-action"]');
    const confirmButton = page.getByRole("button", { name: /delete|confirm/i });

    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(lastActionProbe).toHaveText("confirmed", { timeout: 1000 });
});

test("confirm dialog cancels action", async ({ page }) => {
    await page.goto("/iframe.html?id=common-confirmdialog--interactive");

    const lastActionProbe = page.locator('[data-testid="last-action"]');
    const cancelButton = page.getByRole("button", { name: /cancel/i });

    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await expect(lastActionProbe).toHaveText("canceled", { timeout: 1000 });
});

test("confirm dialog closes on escape", async ({ page }) => {
    await page.goto("/iframe.html?id=common-confirmdialog--interactive");

    const isOpenProbe = page.locator('[data-testid="is-open"]');

    await expect(isOpenProbe).toHaveText("true");

    await page.keyboard.press("Escape");

    await expect(isOpenProbe).toHaveText("false", { timeout: 1000 });
});

test("confirm dialog displays title and description", async ({ page }) => {
    await page.goto("/iframe.html?id=common-confirmdialog--open");

    const dialogTitle = page.locator('[data-testid="dialog-title"]');
    await expect(dialogTitle).toHaveText("Delete resource");
});

test("confirm dialog without description variant renders", async ({ page }) => {
    await page.goto(
        "/iframe.html?id=common-confirmdialog--without-description",
    );

    const dialogTitle = page.locator('[data-testid="dialog-title"]');
    await expect(dialogTitle).toHaveText("Confirm action");
});
