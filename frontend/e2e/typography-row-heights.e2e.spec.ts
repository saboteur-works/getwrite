import { test, expect, type Page } from "@playwright/test";

/**
 * Feature 91 (FR-17, Task 26): controls shown in one row have the same rendered
 * height, within 1 CSS px at the default root font size. Reads
 * getBoundingClientRect().height of the visible control of each field in the
 * Project Settings heading and body modals and in the Project Type Manager
 * form. No existing preferences e2e covers these stories, so this is a new
 * spec.
 */

const TOLERANCE_PX = 1;

const HEADING_STORY =
  "/iframe.html?id=preferences-headingsettingsmodal--default";
const BODY_STORY = "/iframe.html?id=preferences-bodysettingsmodal--default";
const FORM_STORY =
  "/iframe.html?id=projecttypes-projecttypeeditorform--interactive";

const HEADING_KEYS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "color",
  "letterSpacing",
] as const;
const BODY_KEYS = [
  "fontFamily",
  "fontSize",
  "lineHeight",
  "paragraphSpacing",
] as const;

type Heights = Record<string, number>;

async function measure(
  page: Page,
  prefix: string,
  keys: readonly string[],
): Promise<Heights> {
  const heights: Heights = {};
  for (const key of keys) {
    const control = page.locator(`#${prefix}-${key}`);
    await expect(control, `${prefix}-${key} visible`).toBeVisible();
    heights[key] = await control.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
  }
  return heights;
}

function spread(heights: Heights): number {
  const values = Object.values(heights);
  return Math.max(...values) - Math.min(...values);
}

function assertRow(name: string, heights: Heights): void {
  console.log(
    `FR17 ${name}: ${JSON.stringify(heights)} spread=${spread(heights)}`,
  );
  expect(
    spread(heights),
    `${name} heights ${JSON.stringify(heights)}`,
  ).toBeLessThanOrEqual(TOLERANCE_PX);
}

async function expectDefaultRootFontSize(page: Page): Promise<void> {
  const size = await page.evaluate(
    () => getComputedStyle(document.documentElement).fontSize,
  );
  expect(size).toBe("16px");
}

test.describe("Typography row heights (FR-17)", () => {
  test("Project Settings H1 heading row", async ({ page }) => {
    await page.goto(HEADING_STORY);
    await expectDefaultRootFontSize(page);
    assertRow("settings H1 row", await measure(page, "h1", HEADING_KEYS));
  });

  test("Project Settings body controls", async ({ page }) => {
    await page.goto(BODY_STORY);
    await expectDefaultRootFontSize(page);
    assertRow("settings body", await measure(page, "body", BODY_KEYS));
  });

  test("Type Manager form H1 heading row and body controls", async ({
    page,
  }) => {
    await page.goto(FORM_STORY);
    await expectDefaultRootFontSize(page);
    assertRow("type form H1 row", await measure(page, "type-h1", HEADING_KEYS));
    assertRow("type form body", await measure(page, "type-body", BODY_KEYS));
  });
});
