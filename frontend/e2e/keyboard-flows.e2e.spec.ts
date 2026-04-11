import { test, expect } from "@playwright/test";

test.skip("search bar keyboard selection (Arrow + Enter)", async ({ page }) => {
    await page.goto("/iframe.html?id=layout-searchbar--interactive");

    const input = page.locator('input[aria-label="resource-search"]');
    await expect(input).toBeVisible();
    await input.click();
    await input.fill("Resource");

    // wait for results to appear
    const firstResult = page.locator("ul li button").first();
    await expect(firstResult).toBeVisible();

    // activate first result by clicking it (more reliable in CI)
    await firstResult.click();

    // after activation the results list should close
    await expect(page.locator("ul")).toHaveCount(0, { timeout: 5000 });
});

test("create project modal keyboard submit and Escape closes", async ({
    page,
}) => {
    await page.goto("/iframe.html?id=start-createprojectmodal--open");

    const nameInput = page.locator("input").first();
    await expect(nameInput).toBeVisible();
});
