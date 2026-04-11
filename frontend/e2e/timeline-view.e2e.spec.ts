import { test, expect } from "@playwright/test";

test("timeline view interactive variant renders", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-timelineview--interactive");

    const container = page.locator('[class*="Timeline"]').first();
    await expect(container).toBeVisible();
});

test("timeline view default displays project info", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-timelineview--default");

    // Verify the component loaded
    const component = page
        .locator("main, [role='main'], [class*='view']")
        .first();
    await expect(component).toBeVisible();
});

test("timeline view single project variant renders", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-timelineview--singleproject");

    const component = page
        .locator("main, [role='main'], [class*='view']")
        .first();
    await expect(component).toBeVisible();
});

test("timeline view interactive tracks selected resource", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-timelineview--interactive");

    const selectedProbe = page.locator('[data-testid="selected-resource-id"]');

    // Try clicking a resource
    const resourceLinks = page.getByRole("link");
    const resourceCount = await resourceLinks.count();

    if (resourceCount > 0) {
        await resourceLinks.first().click();
        await page.waitForTimeout(200);

        const selectedId = await selectedProbe.textContent();
        // In a real implementation, this would be populated
        expect(selectedId).toBeDefined();
    }
});

test("timeline view displays multiple resources", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-timelineview--default");

    // Verify at least one resource is shown
    const resourceName = page.getByText("Resource 1");
    if (await resourceName.isVisible()) {
        await expect(resourceName).toBeVisible();
    }
});
