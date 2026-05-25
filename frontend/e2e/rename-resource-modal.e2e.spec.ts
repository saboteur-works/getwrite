import { test, expect } from "@playwright/test";

test("rename resource modal interactive variant opens", async ({ page }) => {
  await page.goto("/iframe.html?id=tree-renameresourcemodal--interactive");

  const isOpenProbe = page.locator('[data-testid="is-open"]');
  await expect(isOpenProbe).toHaveText("true");
});

test("rename resource modal interactive tracks rename", async ({ page }) => {
  await page.goto("/iframe.html?id=tree-renameresourcemodal--interactive");

  const nameInput = page.locator("input").first();
  const lastRenameProbe = page.locator('[data-testid="last-rename"]');

  await expect(nameInput).toBeVisible();
  await nameInput.fill("New Resource Name");

  const saveButton = page.getByRole("button", { name: /save/i });
  await expect(saveButton).toBeVisible();
  await saveButton.click();

  await expect(lastRenameProbe).toHaveText("New Resource Name", {
    timeout: 1000,
  });
});

test("rename resource modal interactive tracks open state", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=tree-renameresourcemodal--interactive");

  const isOpenProbe = page.locator('[data-testid="is-open"]');
  await expect(isOpenProbe).toHaveText("true");

  const cancelButton = page.getByRole("button", { name: /cancel/i });
  await expect(cancelButton).toBeVisible();
  await cancelButton.click();

  await expect(isOpenProbe).toHaveText("false", { timeout: 1000 });
});

test("rename resource modal closes on escape", async ({ page }) => {
  await page.goto("/iframe.html?id=tree-renameresourcemodal--interactive");

  const isOpenProbe = page.locator('[data-testid="is-open"]');
  await expect(isOpenProbe).toHaveText("true");

  await page.keyboard.press("Escape");
  await expect(isOpenProbe).toHaveText("false", { timeout: 1000 });
});

test("rename resource modal allows keyboard submit", async ({ page }) => {
  await page.goto("/iframe.html?id=tree-renameresourcemodal--interactive");

  const nameInput = page.locator('input[type="text"], input').first();
  const lastRenameProbe = page.locator('[data-testid="last-rename"]');

  await expect(nameInput).toBeVisible();
  await nameInput.fill("Keyboard Submitted Name");
  await nameInput.press("Enter");

  await expect(lastRenameProbe).toHaveText("Keyboard Submitted Name", {
    timeout: 1000,
  });
});
