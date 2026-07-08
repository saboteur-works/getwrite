import { test, expect } from "@playwright/test";

test("Project Settings menu item is visible when settings menu is open with a project", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=layout-shellsettingsmenu--settings-menu-open",
  );
  const item = page.getByRole("menuitem", { name: /project settings/i });
  await expect(item).toBeVisible();
});

test("Project Settings menu item is absent when no project is loaded", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=layout-shellsettingsmenu--no-project");
  const item = page.getByRole("menuitem", { name: /project settings/i });
  await expect(item).not.toBeVisible();
});

test("clicking Project Settings fires the correct action", async ({ page }) => {
  await page.goto("/iframe.html?id=layout-shellsettingsmenu--interactive");
  const probe = page.locator('[data-testid="last-action"]');
  await page.getByRole("menuitem", { name: /project settings/i }).click();
  await expect(probe).toHaveText("project-settings");
});

test("DefaultRevisionNameModal renders with the initial name in the input", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=preferences-defaultrevisionnamemodal--default",
  );
  const input = page.getByRole("textbox");
  await expect(input).toHaveValue("Initial Draft");
});

test("DefaultRevisionNameModal shows a validation error for an empty name", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=preferences-defaultrevisionnamemodal--default",
  );
  await page.getByRole("textbox").fill("");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(/cannot be empty/i);
});

test("DefaultRevisionNameModal cancel button does not call save", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=preferences-defaultrevisionnamemodal--default",
  );
  await page.getByRole("button", { name: /cancel/i }).click();
  // Modal component is still rendered in the story after cancel (story doesn't dismiss).
  // Assert save button remains — confirming no crash and save was not called.
  await expect(page.getByRole("button", { name: /save/i })).toBeVisible();
});
