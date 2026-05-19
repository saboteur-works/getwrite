import { test, expect } from "@playwright/test";

test("search bar keyboard input is accepted", async ({ page }) => {
    await page.goto("/iframe.html?id=layout-searchbar--interactive");

    const input = page.locator('input[aria-label="resource-search"], input');
    await expect(input).toBeVisible();
    await input.click();
    await input.fill("Resource");

    // Verify the input captured the typed value.
    // Search results require the real API and won't appear in Storybook.
    await expect(input).toHaveValue("Resource");
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
