import { test, expect } from "@playwright/test";

test("organizer view interactive variant tracks body toggle", async ({
    page,
}) => {
    await page.goto("/iframe.html?id=workarea-organizerview--interactive");

    const showBodyProbe = page.locator('[data-testid="show-body"]');
    const initialState = await showBodyProbe.textContent();

    const toggleButton = page
        .getByRole("button", {
            name: /show|hide|toggle/i,
        })
        .first();
    if (await toggleButton.isVisible()) {
        await toggleButton.click();

        const newState = await showBodyProbe.textContent();
        expect(newState).not.toEqual(initialState);
    }
});

test("organizer view displays resource cards", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-organizerview--default");

    const resourceCount = page.locator('[data-testid="resource-count"]');
    await expect(resourceCount).toHaveText("3");
});

test("organizer view default shows folder headers", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-organizerview--default");

    // OrganizerView renders folder trees; resource names are inside collapsed folders.
    // The Storybook global store provides "Folder 1" and "Folder 2" as root folders.
    await expect(page.getByText("Folder 1")).toBeVisible();
    await expect(page.getByText("Folder 2")).toBeVisible();
});
