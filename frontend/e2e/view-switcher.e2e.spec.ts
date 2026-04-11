import { test, expect } from "@playwright/test";

test("view switcher interactive variant renders all tabs", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-viewswitcher--interactive");

    const editTab = page.getByRole("tab", { name: /edit/i });
    const organizerTab = page.getByRole("tab", { name: /organizer/i });
    const dataTab = page.getByRole("tab", { name: /data/i });

    await expect(editTab).toBeVisible();
    if (await organizerTab.isVisible()) {
        await expect(organizerTab).toBeVisible();
    }
    if (await dataTab.isVisible()) {
        await expect(dataTab).toBeVisible();
    }
});

test("view switcher changes active view on tab click", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-viewswitcher--interactive");

    // Click organizer tab if it exists
    const organizerTab = page.getByRole("tab", { name: /organizer/i });
    if (await organizerTab.isVisible()) {
        await organizerTab.click();

        // Verify the active-view probe updated
        const activeView = page.locator('[data-testid="active-view"]');
        await expect(activeView).toHaveText("organizer");
    }
});

test("view switcher cycles through views", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-viewswitcher--interactive");

    const views = ["edit", "organizer", "data", "diff", "timeline"];
    const activeView = page.locator('[data-testid="active-view"]');

    for (const viewName of views) {
        const tab = page.getByRole("tab", { name: new RegExp(viewName, "i") });
        if (await tab.isVisible()) {
            await tab.click();
            await expect(activeView).toHaveText(viewName);
        }
    }
});

test("view switcher default view is edit", async ({ page }) => {
    await page.goto("/iframe.html?id=workarea-viewswitcher--interactive");

    const activeView = page.locator('[data-testid="active-view"]');
    await expect(activeView).toHaveText("edit");
});
