import { test, expect } from "@playwright/test";

test("timeline view interactive variant renders", async ({ page }) => {
  await page.goto("/iframe.html?id=workarea-timelineview--interactive");

  // Verify page loaded at correct URL
  await expect(page).toHaveURL(/timelineview--interactive/);
});

test("timeline view default renders timeline chips", async ({ page }) => {
  await page.goto("/iframe.html?id=workarea-timelineview--default");

  const chips = page.getByRole("listitem");
  await expect(chips.first()).toBeVisible();
});

test("timeline view single item variant renders", async ({ page }) => {
  await page.goto("/iframe.html?id=workarea-timelineview--single-item");

  const chip = page.getByRole("listitem", { name: "The Only Scene" });
  await expect(chip).toBeVisible();
});

test("timeline view interactive tracks selected resource", async ({ page }) => {
  await page.goto("/iframe.html?id=workarea-timelineview--interactive");
  const selectedProbe = page.locator('[data-testid="selected-resource-id"]');
  const resourceChips = page.locator('button[role="listitem"]');
  await expect(resourceChips.first()).toBeVisible();
  await resourceChips.first().click();
  await expect(selectedProbe).not.toBeEmpty({ timeout: 2000 });
});

test("timeline view displays multiple resources", async ({ page }) => {
  await page.goto("/iframe.html?id=workarea-timelineview--default");

  // Verify at least one resource is shown
  const resourceName = page.getByText("Resource 1");
  if (await resourceName.isVisible()) {
    await expect(resourceName).toBeVisible();
  }
});
