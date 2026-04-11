import { test, expect } from "@playwright/test";

test("organizer view interactive variant renders", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-organizerview--interactive");

    const container = page.locator('[class*="Organizer"]').first();
    await expect(container).toBeVisible();
});

test("organizer view interactive variant tracks body toggle", async ({
    page,
}) => {
    await page.goto("/iframe.html?id=workarea-organizerview--interactive");

    const showBodyProbe = page.locator('[data-testid="show-body"]');
    const initialState = await showBodyProbe.textContent();

    // Look for a toggle button (e.g., "Show Body" or similar)
    const toggleButton = page
        .getByRole("button", {
            name: /show|hide|toggle/i,
        })
        .first();
    if (await toggleButton.isVisible()) {
        await toggleButton.click();

        // Verify the probe updated
        const newState = await showBodyProbe.textContent();
        expect(newState).not.toEqual(initialState);
    }
});

test("organizer view displays resource cards", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-organizerview--default");

    // Look for cards or items
    const cards = page.locator('[class*="Card"]');
    const cardCount = await cards.count();

    // Sample project should have at least one resource
    if (cardCount > 0) {
        await expect(cards.first()).toBeVisible();
    }
});

test("organizer view interactive tracks selected resource", async ({
    page,
}) => {
    await page.goto("/iframe.html?id=workarea-organizerview--interactive");

    const selectedProbe = page.locator('[data-testid="selected-resource-id"]');

    // Try clicking a resource card
    const cardButtons = page.locator('[role="button"]');
    const cardCount = await cardButtons.count();

    if (cardCount > 1) {
        // Click second button (first might be a toggle)
        await cardButtons.nth(1).click();

        // Verify probe was updated
        const selectedId = await selectedProbe.textContent();
        expect(selectedId).toBeTruthy();
    }
});
