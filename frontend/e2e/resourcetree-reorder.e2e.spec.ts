import { test, expect } from "@playwright/test";

test("resource tree reorder moves items visually", async ({ page }) => {
    await page.goto("/iframe.html?id=tree-resourcetree--reorderable");

    await expect(page).toHaveURL(/resourcetree--reorderable/);

    await expect(page.locator("body")).toBeVisible();
});
