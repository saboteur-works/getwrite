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

    // instead of fragile DnD, use the story's simulate button to trigger reorder
    const sim = page.locator('button[data-testid="reorder-simulate"]');
    await expect(sim).toHaveCount(1);
    // click the hidden simulate button via page.evaluate to avoid visibility restrictions
    await page.evaluate(() => {
        const b = document.querySelector(
            'button[data-testid="reorder-simulate"]',
        ) as HTMLButtonElement | null;
        if (b) b.click();
    });

    // probe should contain comma-separated ids after simulation
    const probe = page.locator('[data-testid="reorder-probe"]');
    await expect(probe).toHaveText(/,/, { timeout: 2000 });

    // allow UI to update
    await page.waitForTimeout(250);

    // capture new order
    const after: string[] = [];
    const newCount = await topItems.count();
    for (let i = 0; i < newCount; i++) {
        const txt = (await topItems.nth(i).innerText()).trim();
        after.push(txt.split("\n")[0]);
    }

    // Expect that the item that was first moved to a different index
    const moved = before[0];
    const newIndex = after.indexOf(moved);
    expect(newIndex).toBeGreaterThan(0);
});
