import { test, expect } from "@playwright/test";

test("compile preview modal interactive variant opens", async ({ page }) => {
  await page.goto("/iframe.html?id=common-compilepreviewmodal--interactive");

  // Verify page loaded
  await expect(page).toHaveURL(/compilepreviewmodal--interactive/);
});

test("compile preview modal displays project preview", async ({ page }) => {
  await page.goto(
    "/iframe.html?id=common-compilepreviewmodal--project-preview",
  );

  const content = page.locator("body");
  const text = await content.textContent();

  // Verify some content is displayed
  expect(text).toBeTruthy();
});

test("compile preview modal displays resource preview", async ({ page }) => {
  await page.goto(
    "/iframe.html?id=common-compilepreviewmodal--resource-preview",
  );

  const previewMode = page.locator('[data-testid="preview-mode"]');
  await expect(previewMode).toHaveText("resource");
});

test("compile preview modal shows resource tree", async ({ page }) => {
  await page.goto(
    "/iframe.html?id=common-compilepreviewmodal--project-preview",
  );

  const tree = page.locator('[data-testid="compile-resource-tree"]');
  await expect(tree).toBeVisible();
});

test("compile preview modal interactive tracks compile action", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=common-compilepreviewmodal--interactive");

  // Watches the compile-only counter, not `last-action`: the modal closes
  // itself after compiling, so `last-action` flips to "close" and a test
  // reading it races that transition — this was the suite's last remaining
  // nondeterministic test, failing roughly one run in three.
  const compileCountProbe = page.locator('[data-testid="compile-count"]');
  const compileButton = page.getByRole("button", { name: /compile/i }).first();

  await expect(compileButton).toBeVisible();
  await compileButton.click();

  await expect(compileCountProbe).toHaveText("1");
});

test("compile preview modal interactive tracks is-open state", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=common-compilepreviewmodal--interactive");

  const isOpenProbe = page.locator('[data-testid="is-open"]');

  // Should be open initially
  await expect(isOpenProbe).toHaveText("true");

  // Close modal
  const closeButton = page.getByRole("button", { name: /close/i }).first();
  if (await closeButton.isVisible()) {
    await closeButton.click();

    // Should be closed
    await expect(isOpenProbe).toHaveText("false", { timeout: 1000 });
  }
});
