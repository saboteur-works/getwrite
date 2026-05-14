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

test("metadata sidebar end date shows computed value in read-only mode", async ({ page }) => {
    await page.goto("/iframe.html?id=sidebar-metadatasidebar--with-end-date");

    const overrideToggle = page.getByLabel("end-date-override-toggle");
    await expect(overrideToggle).toBeVisible();

    const editableInput = page.getByLabel("story-end-date-input");
    await expect(editableInput).not.toBeVisible();
});

test("metadata sidebar end date override can be set", async ({ page }) => {
    await page.goto("/iframe.html?id=sidebar-metadatasidebar--interactive");

    const overrideToggle = page.getByLabel("end-date-override-toggle");
    await expect(overrideToggle).toBeVisible();
    await overrideToggle.click();

    const endDateInput = page.getByLabel("story-end-date-input");
    await expect(endDateInput).toBeVisible();

    await endDateInput.fill("2024-06-01T06:00");

    const lastChangeProbe = page.locator('[data-testid="last-change"]');
    await expect(lastChangeProbe).not.toBeEmpty({ timeout: 2000 });
});

test("metadata sidebar duration unit selector works", async ({ page }) => {
    await page.goto("/iframe.html?id=sidebar-metadatasidebar--interactive");

    const unitSelect = page.getByLabel("story-duration-unit");
    await expect(unitSelect).toBeVisible();
    await unitSelect.selectOption("hours");

    const quantityInput = page.getByLabel("story-duration-quantity");
    await quantityInput.fill("2");
    await quantityInput.blur();

    const lastChangeProbe = page.locator('[data-testid="last-change"]');
    await expect(lastChangeProbe).toHaveText("120", { timeout: 2000 });
});
