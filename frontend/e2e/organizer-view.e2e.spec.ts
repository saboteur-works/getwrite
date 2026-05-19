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

test("organizer view default shows empty state", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-organizerview--default");

    // OrganizerView shows a prompt when no folder is selected in the Redux store.
    // The global mock store has selectedResourceId: null, so no folder is active.
    await expect(page.getByText("Select a folder to view its contents.")).toBeVisible();
});
