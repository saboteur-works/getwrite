import { test, expect, type Page } from "@playwright/test";

/**
 * Organizer grid, phone layout (Feature 109, FR-10). The phone story renders
 * `OrganizerPhoneGroups` directly and the two-axis story renders the matrix;
 * neither story goes through `useViewportTier`, so the width decides nothing
 * here and each width is a check of the story's own layout at that width.
 */

const PHONE_STORY = "/iframe.html?id=workarea-organizergrid--phone-groups";
const MATRIX_STORY = "/iframe.html?id=workarea-organizergrid--two-axis-grid";

/** Card titles in the story data (`OrganizerGrid.stories.tsx` SEEDS). */
const CARD_TITLES: string[] = [
  "The Lighthouse Keeper",
  "Letters Home",
  "The Crossing",
  "Salt and Iron",
  "Island Weather Notes",
  "Unsorted Fragments",
];

const GROUP_HEADINGS: RegExp[] = [
  /^Draft \(2\)$/,
  /^Revising \(1\)$/,
  /^Final \(1\)$/,
  /^Other values \(1\)$/,
  /^None \(1\)$/,
];

async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

for (const width of [360, 767]) {
  test(`phone groups at ${width}px: groups, no grid, every card reachable, no horizontal scroll`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(PHONE_STORY);

    for (const heading of GROUP_HEADINGS) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
    await expect(page.getByRole("grid")).toHaveCount(0);

    for (const title of CARD_TITLES) {
      const card = page.getByRole("button", { name: title, exact: true });
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeVisible();
      const open = page.getByRole("button", { name: `Open ${title}` });
      await expect(open).toBeVisible();
      const box = await open.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }

    expect(await hasHorizontalScroll(page)).toBe(false);
  });
}

test("matrix at 768px renders as a grid", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 800 });
  await page.goto(MATRIX_STORY);

  await expect(page.getByRole("grid")).toBeVisible();
  await expect(
    page.getByRole("rowheader", { name: "Other values" }),
  ).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "None" })).toBeVisible();
});

for (const [width, story, other] of [
  [360, PHONE_STORY, "grid"],
  [768, MATRIX_STORY, "phone group"],
] as const) {
  test(`first paint at ${width}px: record whether the other layout shows`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(story, { waitUntil: "commit" });
    await page.waitForLoadState("domcontentloaded");
    // Observation, not assertion: what is in the DOM at the earliest point.
    const earlyGrid = await page.getByRole("grid").count();
    const earlyGroups = await page.getByRole("group").count();
    await testInfo.attach(`first-paint-${width}`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    const isOtherShown = other === "grid" ? earlyGrid > 0 : earlyGroups > 0;
    testInfo.annotations.push({
      type: "first-paint",
      description: `${width}px, story ${story}: other layout (${other}) ${
        isOtherShown ? "observed" : "not observed"
      } at domcontentloaded (grid count ${earlyGrid}, group count ${earlyGroups})`,
    });
    // After load the settled layout must be the story's own.
    if (other === "grid") {
      await expect(page.getByRole("heading", { name: /^Draft/ })).toBeVisible();
      await expect(page.getByRole("grid")).toHaveCount(0);
    } else {
      await expect(page.getByRole("grid")).toBeVisible();
    }
  });
}
