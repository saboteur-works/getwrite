import { test, expect } from "@playwright/test";

const PACKAGE_STORY = "/iframe.html?id=start-startpage--package-flow";

async function readLastCompileCall(
  page: import("@playwright/test").Page,
): Promise<{ url: string | null; body: unknown }> {
  return page.evaluate(() => {
    const state = (
      window as unknown as {
        __packageFlowMockState?: {
          lastCompileUrl: string | null;
          lastCompileBody: string | null;
        };
      }
    ).__packageFlowMockState;
    if (!state) return { url: null, body: null };
    return {
      url: state.lastCompileUrl,
      body: state.lastCompileBody ? JSON.parse(state.lastCompileBody) : null,
    };
  });
}

async function openPackageModal(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.locator('[aria-haspopup="menu"]').first().click();
  await page.getByRole("menuitem", { name: /package/i }).click();
  await expect(
    page.locator('[data-testid="compile-preview-modal"]'),
  ).toBeVisible();
}

test("Package menu item opens the compile modal with resources listed", async ({
  page,
}) => {
  await page.goto(PACKAGE_STORY);
  await openPackageModal(page);

  await expect(
    page.getByRole("heading", { name: /compile project/i }),
  ).toBeVisible();
  // Default selection: initAllChecked seeds only leaves, so 2 resources selected.
  await expect(page.getByText(/2 resource\(s\) selected/i)).toBeVisible();
  await expect(page.getByText(/chapter one/i)).toBeVisible();
  await expect(page.getByText(/chapter two/i)).toBeVisible();
});

test("Compile (txt default) posts to /api/compile/text with project + resource ids", async ({
  page,
}) => {
  await page.goto(PACKAGE_STORY);
  await openPackageModal(page);

  await page.getByRole("button", { name: /compile \(\d+\)/i }).click();

  // Modal closes after compile.
  await expect(
    page.locator('[data-testid="compile-preview-modal"]'),
  ).toHaveCount(0);

  const { url, body } = await readLastCompileCall(page);
  expect(url).toBe("/api/compile/text");
  expect(body).toMatchObject({
    projectPath: "/tmp/projects/pack",
    projectName: "Packageable Project",
    includeHeaders: true,
  });
  expect((body as { resourceIds: string[] }).resourceIds).toEqual(
    expect.arrayContaining(["pack-res-1", "pack-res-2"]),
  );
});

test("Compile as pdf posts to /api/compile/pdf", async ({ page }) => {
  await page.goto(PACKAGE_STORY);
  await openPackageModal(page);

  await page.locator("#compile-as").selectOption("pdf");
  await page.getByRole("button", { name: /compile \(\d+\)/i }).click();

  await expect(
    page.locator('[data-testid="compile-preview-modal"]'),
  ).toHaveCount(0);

  const { url } = await readLastCompileCall(page);
  expect(url).toBe("/api/compile/pdf");
});

test("Select None disables the Compile button", async ({ page }) => {
  await page.goto(PACKAGE_STORY);
  await openPackageModal(page);

  await page.getByRole("button", { name: /^select none$/i }).click();

  await expect(page.getByText(/0 resource\(s\) selected/i)).toBeVisible();
  const compileBtn = page.getByRole("button", { name: /compile \(0\)/i });
  await expect(compileBtn).toBeDisabled();
});

test("Unchecking 'Include section headers' is reflected in the compile body", async ({
  page,
}) => {
  await page.goto(PACKAGE_STORY);
  await openPackageModal(page);

  await page.locator("#compile-include-headers").uncheck();
  await page.getByRole("button", { name: /compile \(\d+\)/i }).click();

  const { body } = await readLastCompileCall(page);
  expect(body).toMatchObject({ includeHeaders: false });
});

test("Close button dismisses the compile modal without firing compile", async ({
  page,
}) => {
  await page.goto(PACKAGE_STORY);
  await openPackageModal(page);

  await page.getByRole("button", { name: /^close$/i }).click();
  await expect(
    page.locator('[data-testid="compile-preview-modal"]'),
  ).toHaveCount(0);

  const { url } = await readLastCompileCall(page);
  expect(url).toBeNull();
});
