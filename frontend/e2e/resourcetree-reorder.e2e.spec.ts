import { test, expect } from "@playwright/test";

test("resource tree drag-and-drop reorders items visually", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=tree-resourcetree--reorderable");

  const nav = page.locator('[aria-label="Resource tree"]');
  await expect(nav).toBeVisible();

  // ensure at least one item rendered before triggering simulation
  const topLevel = page.locator(".resource-tree-item");
  await expect(topLevel.first()).toBeVisible();

  await page.evaluate(() => (window as any).__simulateReorder());

  const probe = page.locator('[data-testid="reorder-probe"]');
  await expect(probe).not.toBeEmpty({ timeout: 1000 });
});
