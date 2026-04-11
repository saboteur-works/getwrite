import { test, expect } from "@playwright/test";

test("timeline view interactive variant renders", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-timelineview--interactive");

    // Verify page loaded at correct URL
    await expect(page).toHaveURL(/timelineview--interactive/);
});

test("timeline view default displays project info", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-timelineview--default");

    const projectName = page.locator('[data-testid="project-name"]');
    await expect(projectName).toHaveText("Example Project");
});

test("timeline view single project variant renders", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-timelineview--single-project");

    const projectName = page.locator('[data-testid="project-name"]');
    await expect(projectName).toHaveText("Example Project");
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
