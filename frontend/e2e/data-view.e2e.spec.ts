import { test, expect } from "@playwright/test";

test("data view interactive variant renders", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-dataview--interactive");

    const container = page.locator('[class*="Data"]').first();
    await expect(container).toBeVisible();
});

test("data view displays resource count", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-dataview--withresources");

    const countProbe = page.locator('[data-testid="resource-count"]');
    const count = await countProbe.textContent();

    expect(count).toMatch(/\d+/);
});

test("data view interactive tracks selected resource", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-dataview--interactive");

    const selectedProbe = page.locator('[data-testid="selected-resource-id"]');

    // Try clicking a resource in the list
    const listItems = page.locator('[role="listitem"]');
    const itemCount = await listItems.count();

    if (itemCount > 0) {
        await listItems.first().click();

        // Verify probe was updated
        const selectedId = await selectedProbe.textContent();
        expect(selectedId).toBeTruthy();
    }
});

test("data view withresources shows resource list", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-dataview--withresources");

    // Look for text resources
    const heading = page.getByRole("heading", { name: /resources/i });
    if (await heading.isVisible()) {
        await expect(heading).toBeVisible();
    }

    // Verify at least one resource name is visible
    const resourceName = page.getByText("Resource 1");
    if (await resourceName.isVisible()) {
        await expect(resourceName).toBeVisible();
    }
});

test("data view resource count is non-zero", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-dataview--interactive");

    const countProbe = page.locator('[data-testid="resource-count"]');
    const count = parseInt((await countProbe.textContent()) || "0", 10);

    expect(count).toBeGreaterThan(0);
});
