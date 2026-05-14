import { test, expect } from "@playwright/test";

test("manage project menu opens on trigger click", async ({ page }) => {
    await page.goto("/iframe.html?id=start-manageprojectmenu--interactive");

    await page.locator('[aria-haspopup="menu"]').click();

    const deleteMenuItem = page.getByRole("menuitem", { name: /delete/i });
    const renameMenuItem = page.getByRole("menuitem", { name: /rename/i });
    await expect(deleteMenuItem).toBeVisible();
    await expect(renameMenuItem).toBeVisible();
});

test("manage project menu delete item opens confirm dialog", async ({
    page,
}) => {
    await page.goto("/iframe.html?id=start-manageprojectmenu--interactive");

    await page.locator('[aria-haspopup="menu"]').click();
    await page.getByRole("menuitem", { name: /delete/i }).click();

    const confirmButton = page.getByRole("button", { name: /delete/i }).first();
    await expect(confirmButton).toBeVisible();
});

test("manage project menu rename item opens rename modal", async ({ page }) => {
    await page.goto("/iframe.html?id=start-manageprojectmenu--interactive");

    await page.locator('[aria-haspopup="menu"]').click();
    await page.getByRole("menuitem", { name: /rename/i }).click();

    const nameInput = page.locator("input").first();
    await expect(nameInput).toBeVisible();

    const saveButton = page.getByRole("button", { name: /save/i });
    await expect(saveButton).toBeVisible();
});

test(
    "manage project menu tracks delete action via probe",
    async ({ page }) => {
        await page.route("**/api/project/delete", (route) =>
            route.fulfill({ status: 200, body: "{}" }),
        );
        await page.goto("/iframe.html?id=start-manageprojectmenu--interactive");
        const lastActionProbe = page.locator('[data-testid="last-action"]');
        await page.locator('[aria-haspopup="menu"]').click();
        await page.getByRole("menuitem", { name: /delete/i }).click();
        await page.getByRole("button", { name: /delete/i }).first().click();
        await expect(lastActionProbe).toContainText("delete");
    },
);
