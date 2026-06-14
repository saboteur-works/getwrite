import { test, expect } from "@playwright/test";

test("metadata sidebar interactive tracks resource name", async ({ page }) => {
  await page.goto("/iframe.html?id=sidebar-metadatasidebar--interactive");

  const resourceNameProbe = page.locator(
    '[data-testid="current-resource-name"]',
  );
  const initialName = await resourceNameProbe.textContent();

  expect(initialName).toContain("Example");
});

test("metadata sidebar default displays resource metadata", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=sidebar-metadatasidebar--default");

  const resourceName = page.locator('[data-testid="resource-name"]');
  await expect(resourceName).toHaveText("Example Text Resource");
});

test("metadata sidebar interactive tracks changes", async ({ page }) => {
  await page.goto("/iframe.html?id=sidebar-metadatasidebar--interactive");

  const lastChangeProbe = page.locator('[data-testid="last-change"]');
  const firstInput = page.locator("input, textarea").first();

  await expect(firstInput).toBeVisible();
  const currentValue = await firstInput.inputValue();
  await firstInput.fill(currentValue + " Modified");
  await firstInput.blur();

  await expect(lastChangeProbe).not.toBeEmpty({ timeout: 2000 });
});

test("metadata sidebar end date shows computed value in read-only mode", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=sidebar-metadatasidebar--with-end-date");

  const overrideToggle = page.getByLabel("end-date-override-toggle");
  await expect(overrideToggle).toBeVisible();

  const editableInput = page.getByLabel("story-end-date-input");
  await expect(editableInput).not.toBeVisible();
});

test("metadata sidebar end date override can be set", async ({ page }) => {
  await page.goto("/iframe.html?id=sidebar-metadatasidebar--interactive");

  const overrideToggle = page.getByLabel("end-date-override-toggle");
  await expect(overrideToggle).toBeVisible();
  await overrideToggle.click();

  const endDateInput = page.getByLabel("story-end-date-input");
  await expect(endDateInput).toBeVisible();

  await endDateInput.fill("2024-06-01T06:00");

  const lastChangeProbe = page.locator('[data-testid="last-change"]');
  await expect(lastChangeProbe).not.toBeEmpty({ timeout: 2000 });
});

test("metadata sidebar synopsis input is visible and accepts input", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=sidebar-metadatasidebar--interactive");

  const synopsis = page.getByLabel("synopsis");
  await expect(synopsis).toBeVisible();

  await synopsis.fill("A duel at dawn resolves the tension.");
  await synopsis.blur();

  const lastChangeProbe = page.locator('[data-testid="last-change"]');
  await expect(lastChangeProbe).not.toBeEmpty({ timeout: 2000 });
});

test("metadata sidebar duration unit selector works", async ({ page }) => {
  await page.goto("/iframe.html?id=sidebar-metadatasidebar--interactive");

  const unitSelect = page.getByLabel("story-duration-unit");
  await expect(unitSelect).toBeVisible();
  await unitSelect.selectOption("hours");

  const quantityInput = page.getByLabel("story-duration-quantity");
  await quantityInput.fill("2");
  await quantityInput.blur();

  const lastChangeProbe = page.locator('[data-testid="last-change"]');
  await expect(lastChangeProbe).toHaveText("120", { timeout: 2000 });
});

test("collapse: clicking Document header hides synopsis and notes", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=sidebar-metadatasidebar--interactive-collapse",
  );

  const synopsisTextarea = page.getByLabel("synopsis");
  await expect(synopsisTextarea).toBeVisible();

  await page.getByRole("button", { name: /document/i }).click();
  await expect(synopsisTextarea).not.toBeAttached();
  await expect(page.getByLabel("notes")).not.toBeAttached();
});

test("collapse: clicking Document header again restores synopsis and notes", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=sidebar-metadatasidebar--interactive-collapse",
  );

  const docBtn = page.getByRole("button", { name: /document/i });
  const synopsisTextarea = page.getByLabel("synopsis");

  await docBtn.click();
  await expect(synopsisTextarea).not.toBeAttached();

  await docBtn.click();
  await expect(synopsisTextarea).toBeVisible();
});

test("collapse: clicking story timeline header hides all three timeline inputs", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=sidebar-metadatasidebar--interactive-collapse",
  );

  await expect(
    page.getByLabel("story-date-input", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("story-duration-quantity", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("end-date-override-toggle", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: /story timeline/i }).click();

  await expect(
    page.getByLabel("story-date-input", { exact: true }),
  ).not.toBeAttached();
  await expect(
    page.getByLabel("story-duration-quantity", { exact: true }),
  ).not.toBeAttached();
  await expect(
    page.getByLabel("end-date-override-toggle", { exact: true }),
  ).not.toBeAttached();
});

test("collapse: Document and Timeline sections collapse independently", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=sidebar-metadatasidebar--interactive-collapse",
  );

  // Collapse only the Document section
  await page.getByRole("button", { name: /document/i }).click();
  await expect(page.getByLabel("synopsis")).not.toBeAttached();

  // Timeline should still be visible
  await expect(
    page.getByLabel("story-date-input", { exact: true }),
  ).toBeVisible();
});

test("all-expanded story shows Document and Timeline section headers", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=sidebar-metadatasidebar--all-expanded");

  await expect(page.getByRole("button", { name: /document/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /timeline/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /tags/i })).toBeVisible();
  await expect(page.getByLabel("synopsis")).toBeVisible();
});
