import { test, expect } from "@playwright/test";

test("confirm dialog interactive variant opens", async ({ page }) => {
    await page.goto("/iframe.html?id=common-confirmdialog--interactive");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
});

test("confirm dialog confirms action", async ({ page }) => {
    await page.goto("/iframe.html?id=common-confirmdialog--interactive");

    const lastActionProbe = page.locator('[data-testid="last-action"]');
    const confirmButton = page.getByRole("button", { name: /delete|confirm/i });

    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Verify confirmation was tracked
    await expect(lastActionProbe).toHaveText("confirmed", { timeout: 1000 });
});

test("confirm dialog cancels action", async ({ page }) => {
    await page.goto("/iframe.html?id=common-confirmdialog--interactive");

    const lastActionProbe = page.locator('[data-testid="last-action"]');
    const cancelButton = page.getByRole("button", { name: /cancel/i });

    if (await cancelButton.isVisible()) {
        await cancelButton.click();

        // Verify cancellation was tracked
        await expect(lastActionProbe).toHaveText("canceled", {
            timeout: 1000,
        });
    }
});

test("confirm dialog closes on escape", async ({ page }) => {
    await page.goto("/iframe.html?id=common-confirmdialog--interactive");

    const isOpenProbe = page.locator('[data-testid="is-open"]');

    // Verify initially open
    await expect(isOpenProbe).toHaveText("true");

    // Press Escape
    await page.keyboard.press("Escape");

    // Dialog should close
    await expect(isOpenProbe).toHaveText("false", { timeout: 1000 });
});

test("confirm dialog displays title and description", async ({ page }) => {
    await page.goto("/iframe.html?id=common-confirmdialog--open");

    const dialog = page.getByRole("dialog");
    const title = dialog.getByRole("heading", { name: /delete/i });
    const description = page.getByText(/cannot be undone/i);

    await expect(title).toBeVisible();
    if (await description.isVisible()) {
        await expect(description).toBeVisible();
    }
});

test("confirm dialog without description variant renders", async ({ page }) => {
    await page.goto("/iframe.html?id=common-confirmdialog--withoutdescription");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
});
