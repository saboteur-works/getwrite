import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Project Settings section rail at phone width (`.settings-tabs` in
 * `styles/getwrite-utilities.css`, `ProjectSettingsDialog.tsx`). Below 768px
 * the rail is an icon strip; expanded it lies over the panel without
 * narrowing it; hidden, the panel takes the rail's room. 768px and wider is
 * unchanged.
 */

const STORY = "/iframe.html?id=layout-projectsettingsdialog--default";

/** The visible (active) tab panel. */
function activePanel(page: Page): Locator {
  return page.locator('[role="tabpanel"]:not([hidden])');
}

async function widthOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!.width;
}

async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

for (const width of [360, 412]) {
  test(`phone rail at ${width}px: icon strip, expand over the panel, hide and remember`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(STORY);
    await page.evaluate(() =>
      window.localStorage.removeItem("getwrite-settings-rail-hidden"),
    );
    await page.reload();

    const tablist = page.getByRole("tablist", {
      name: "Project settings sections",
    });
    await expect(tablist).toBeVisible();
    expect(await widthOf(tablist)).toBeLessThanOrEqual(48);

    // Collapsed: names are out of sight, the panel has most of the dialog.
    expect(
      await widthOf(tablist.getByText("Writing Goals", { exact: true })),
    ).toBeLessThanOrEqual(1);
    const collapsedPanel = await widthOf(activePanel(page));
    const dialogWidth = await widthOf(page.getByRole("dialog"));
    expect(collapsedPanel).toBeGreaterThan(dialogWidth - 120);

    // Expanded: names show, the rail widens, the panel keeps its width.
    await page.getByRole("button", { name: "Show section names" }).click();
    expect(
      await widthOf(tablist.getByText("Writing Goals", { exact: true })),
    ).toBeGreaterThan(40);
    // The rail widens over a 150ms transition.
    await expect.poll(() => widthOf(tablist)).toBeGreaterThan(150);
    expect(await widthOf(activePanel(page))).toBeCloseTo(collapsedPanel, 0);

    // Choosing a tab collapses the rail.
    await page.getByRole("tab", { name: "Writing Goals" }).click();
    expect(
      await widthOf(tablist.getByText("Writing Goals", { exact: true })),
    ).toBeLessThanOrEqual(1);
    await expect(
      page.getByRole("button", { name: "Show section names" }),
    ).toHaveAttribute("aria-expanded", "false");

    // Hidden: the rail is gone and the panel grows into its room.
    await page.getByRole("button", { name: "Hide sections" }).click();
    await expect(tablist).toBeHidden();
    expect(await widthOf(activePanel(page))).toBeGreaterThan(
      collapsedPanel + 40,
    );
    expect(await hasHorizontalScroll(page)).toBe(false);

    // Remembered after a reload.
    await page.reload();
    await expect(
      page.getByRole("tablist", { name: "Project settings sections" }),
    ).toBeHidden();
    await page.getByRole("button", { name: "Hide sections" }).click();
    await expect(
      page.getByRole("tablist", { name: "Project settings sections" }),
    ).toBeVisible();
  });
}

test("768px: full rail with names, no phone buttons", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto(STORY);
  await page.evaluate(() =>
    window.localStorage.setItem("getwrite-settings-rail-hidden", "true"),
  );
  await page.reload();

  // A remembered phone choice does not hide the desktop rail.
  const tablist = page.getByRole("tablist", {
    name: "Project settings sections",
  });
  await expect(tablist).toBeVisible();
  expect(
    await widthOf(tablist.getByText("Writing Goals", { exact: true })),
  ).toBeGreaterThan(40);
  await expect(
    page.getByRole("button", { name: "Show section names" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Hide sections" }),
  ).toBeHidden();

  await page.evaluate(() =>
    window.localStorage.removeItem("getwrite-settings-rail-hidden"),
  );
});
