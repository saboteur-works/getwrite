import { test, expect, type Page } from "@playwright/test";

const STORY_URL = "/iframe.html?id=tree-resourcecontextmenu--interactive";

async function openContextMenu(page: Page) {
  await page.goto(STORY_URL);
  // Wait for trigger to be in its initial closed state before right-clicking.
  await page.waitForSelector('[data-testid="trigger"][data-state="closed"]', {
    timeout: 5000,
  });
  // Right-click the trigger to open the menu at a real cursor position.
  await page.click('[data-testid="trigger"]', { button: "right" });
}

test("resource context menu closes on outside click (storybook)", async ({
  page,
}) => {
  await openContextMenu(page);

  const menu = page.locator('[role="menu"]');
  await expect(menu).toBeVisible();

  const outside = page.locator('[data-testid="outside"]');
  await expect(outside).toBeVisible();

  // click outside and assert the menu is removed
  await outside.click();
  await expect(menu).toHaveCount(0);
});

test("resource context menu closes on Escape key", async ({ page }) => {
  await openContextMenu(page);
  const menu = page.locator('[role="menu"]');
  await expect(menu).toBeVisible();

  // Press Escape and expect the menu to be removed
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("keyboard navigation and activation fires action and closes", async ({
  page,
}) => {
  await openContextMenu(page);
  const menu = page.locator('[role="menu"]');
  await expect(menu).toBeVisible();

  // Navigate to Delete via End (last item = Export) then ArrowUp (second-to-last = Delete).
  // This is robust regardless of the starting focus position within the menu.
  await menu.focus();
  await page.keyboard.press("End"); // to Export (last item)
  await page.keyboard.press("ArrowUp"); // to Delete (second-to-last)

  // Activate with Enter and assert the story probe shows the action
  await page.keyboard.press("Enter");
  const lastAction = page.locator('[data-testid="last-action"]');
  await expect(lastAction).toHaveText(/delete/i);

  // menu should close after activation
  await expect(menu).toHaveCount(0);
});

test("clicking Delete button triggers action and closes (mouse)", async ({
  page,
}) => {
  await openContextMenu(page);
  const menu = page.locator('[role="menu"]');
  await expect(menu).toBeVisible();

  const deleteBtn = page.getByRole("menuitem", { name: "Delete" });
  await deleteBtn.click();
  const lastAction = page.locator('[data-testid="last-action"]');
  await expect(lastAction).toHaveText(/delete/i);

  await expect(menu).toHaveCount(0);
});

test("clicking Rename button triggers action and closes (mouse)", async ({
  page,
}) => {
  await openContextMenu(page);
  const menu = page.locator('[role="menu"]');
  await expect(menu).toBeVisible();

  const renameBtn = page.getByRole("menuitem", { name: "Rename" });
  await renameBtn.click();
  const lastAction = page.locator('[data-testid="last-action"]');
  await expect(lastAction).toHaveText(/rename/i);

  await expect(menu).toHaveCount(0);
});

test("menu is positioned by Radix popper (fixed position)", async ({
  page,
}) => {
  await openContextMenu(page);
  const menu = page.locator('[role="menu"]');
  await expect(menu).toBeVisible();

  // Radix positions the menu via a wrapping popper element, not inline left/top on the menu itself.
  const popperWrapper = page.locator("[data-radix-popper-content-wrapper]");
  await expect(popperWrapper).toBeAttached();
  const position = await popperWrapper.evaluate(
    (el) => (el as HTMLElement).style.position,
  );
  expect(position).toBe("fixed");
});
