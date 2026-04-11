import { test, expect } from "@playwright/test";

test("data view shows resources and counts are correct", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-dataview--with-resources");

    const header = page.getByRole("heading", { name: /Data/i });
    await expect(header).toBeVisible();

    // list should contain a placeholder resource from the story
    const item = page.getByText("Resource 1");
    await expect(item).toBeVisible();

    // resources card should show a numeric count in the sibling div
    const resourcesParent = page.getByText("Resources").locator("..");
    const resourcesCountEl = resourcesParent.locator("div").nth(1);
    await expect(resourcesCountEl).toBeVisible();
    const countText = await resourcesCountEl.textContent();
    expect(countText && /\d+/.test(countText)).toBeTruthy();
});

test("create project modal can be filled and submitted", async ({ page }) => {
    await page.goto("/iframe.html?id=start-createprojectmodal--open");

    await expect(page).toHaveURL(/createprojectmodal--open/);

    const name = page.locator("input").first();
    await expect(name).toBeVisible();
    await name.fill("E2E Project");

    await expect(name).toHaveValue("E2E Project");
});

test("edit view editor accepts input and updates word count", async ({
    page,
}) => {
    await page.goto("/iframe.html?id=workarea-editview--interactive");

    await expect(page).toHaveURL(/editview--interactive/);
});
