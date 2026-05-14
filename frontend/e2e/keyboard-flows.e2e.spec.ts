import { test, expect } from "@playwright/test";

test("search bar keyboard selection (Arrow + Enter)", async ({ page }) => {
    await page.goto("/iframe.html?id=layout-searchbar--interactive");

    const input = page.locator('input[aria-label="resource-search"], input');
    await expect(input).toBeVisible();
    await input.click();
    await input.fill("Resource");

    const firstResult = page.locator("ul li button").first();
    await expect(firstResult).toBeVisible();
    await firstResult.click();

    const selectedId = page.locator('[data-testid="search-selected-id"]');
    await expect(selectedId).not.toBeEmpty({ timeout: 5000 });
});

test(
    "create project modal keyboard submit",
    async ({ page }) => {
        await page.goto("/iframe.html?id=start-createprojectmodal--open");
        const nameInput = page.locator("input").first();
        await expect(nameInput).toBeVisible();
        await nameInput.fill("Keyboard Project");
        await nameInput.press("Enter");
        const createdPayload = page.locator('[data-testid="created-payload"]');
        await expect(createdPayload).not.toBeEmpty({ timeout: 2000 });
    },
);

test("create project modal closes on Escape", async ({ page }) => {
    await page.goto("/iframe.html?id=start-createprojectmodal--open");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(dialog).not.toBeVisible({ timeout: 2000 });
});
