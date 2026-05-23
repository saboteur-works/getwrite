import { test, expect } from "@playwright/test";

test("revision control interactive renders revision list", async ({ page }) => {
  await page.goto(
    "/iframe.html?id=editor-revisioncontrol-revisioncontrol--with-revisions",
  );

  const revisionCount = page.locator('[data-testid="revision-count"]');
  await expect(revisionCount).toHaveText("2");
});

test("revision control shows canonical revision probe", async ({ page }) => {
  await page.goto(
    "/iframe.html?id=editor-revisioncontrol-revisioncontrol--with-revisions",
  );

  const canonicalProbe = page.locator('[data-testid="canonical-revision"]');
  await expect(canonicalProbe).toHaveText("rev-2");
});

test("revision control allows revision selection and updates active state", async ({
  page,
}) => {
  await page.route("**/api/resource/revision/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: "Mock revision content" }),
    }),
  );

  await page.goto(
    "/iframe.html?id=editor-revisioncontrol-revisioncontrol--interactive",
  );

  // RevisionControl mounts collapsed — expand it first
  const expandBtn = page.getByRole("button", { name: /expand/i });
  await expect(expandBtn).toBeVisible();
  await expandBtn.click();

  // rev-1 is the non-canonical revision; its card has a "View Revision" button
  const viewBtn = page.getByRole("button", { name: /view revision/i });
  await expect(viewBtn).toBeVisible();
  await viewBtn.click();

  const activeProbe = page.locator('[data-testid="active-revision-id"]');
  await expect(activeProbe).toHaveText("rev-1", { timeout: 2000 });
});
