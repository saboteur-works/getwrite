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

    // perform a JS-driven drag/drop using a DataTransfer shim to trigger HTML5 handlers
    await page.evaluate(
        ({ srcIndex, tgtIndex }) => {
            const nav = document.querySelector(
                'nav[aria-label="Resource tree"]',
            );
            if (!nav) return;
            const items = Array.from(
                nav.querySelectorAll('[role="tree"] > li'),
            ) as HTMLElement[];
            const src = items[srcIndex];
            const tgt = items[tgtIndex];
            if (!src || !tgt) return;
            const dataTransfer: any = { data: {} };
            dataTransfer.setData = (k: string, v: string) =>
                (dataTransfer.data[k] = v);
            dataTransfer.getData = (k: string) => dataTransfer.data[k];

            const fire = (el: HTMLElement, type: string) => {
                const evt: any = document.createEvent("Event");
                evt.initEvent(type, true, true);
                evt.dataTransfer = dataTransfer;
                el.dispatchEvent(evt);
            };

            fire(src, "dragstart");
            fire(tgt, "dragover");
            fire(tgt, "drop");
            fire(src, "dragend");
        },
        { srcIndex: 0, tgtIndex: 1 },
    );

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
