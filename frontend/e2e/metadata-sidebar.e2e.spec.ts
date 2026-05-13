import { test, expect } from "@playwright/test";

test("metadata sidebar interactive tracks resource name", async ({ page }) => {
    await page.goto("/iframe.html?id=sidebar-metadatasidebar--interactive");

    const resourceNameProbe = page.locator(
        '[data-testid="current-resource-name"]',
    );
    const initialName = await resourceNameProbe.textContent();

    expect(initialName).toContain("Example");
});

test("metadata sidebar default displays resource metadata", async ({
    page,
}) => {
    await page.goto("/iframe.html?id=sidebar-metadatasidebar--default");

    const resourceName = page.locator('[data-testid="resource-name"]');
    await expect(resourceName).toHaveText("Example Text Resource");
});

test(
    "metadata sidebar interactive tracks changes",
    async ({ page }) => {
        await page.goto("/iframe.html?id=sidebar-metadatasidebar--interactive");

        const lastChangeProbe = page.locator('[data-testid="last-change"]');
        const firstInput = page.locator("input, textarea").first();

        await expect(firstInput).toBeVisible();
        const currentValue = await firstInput.inputValue();
        await firstInput.fill(currentValue + " Modified");
        await firstInput.blur();

        await expect(lastChangeProbe).not.toBeEmpty({ timeout: 2000 });
    },
);
