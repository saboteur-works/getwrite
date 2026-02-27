import { test, expect } from "@playwright/test";

test("resource tree reorder moves items visually", async ({ page }) => {
    await page.goto("/iframe.html?id=tree-resourcetree--reorderable");

    const tree = page.locator('nav[aria-label="Resource tree"]').first();
    await expect(tree).toBeVisible();

    const topItems = tree.locator('[role="tree"] > li');
    const count = await topItems.count();
    expect(count).toBeGreaterThan(1);

    // capture initial top-level order
    const before: string[] = [];
    for (let i = 0; i < count; i++) {
        const txt = (await topItems.nth(i).innerText()).trim();
        before.push(txt.split("\n")[0]);
    }

    // drag first item to position of second item
    const sourceHandle = topItems.nth(0).locator('[data-testid="drag-handle"]');
    const targetItem = topItems.nth(1);
    await expect(sourceHandle).toBeVisible();
    await sourceHandle.dragTo(targetItem);

    // allow UI to update
    await page.waitForTimeout(250);

    // capture new order
    const after: string[] = [];
    const newCount = await topItems.count();
    for (let i = 0; i < newCount; i++) {
        const txt = (await topItems.nth(i).innerText()).trim();
        after.push(txt.split("\n")[0]);
    }

    // Expect that the first item moved to index 1 (i.e., swapped)
    expect(after[1]).toBe(before[0]);
});
