import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * Narratives tab (Feature 110, Task 24; FR-8, FR-12, FR-18, FR-22). Drives the
 * `Folklore/NarrativesView` story, whose reads are fakes passed through `deps`
 * (the story is not evidence about the real routes or a device). The story has
 * one Narrative folder, "Cinderella", with Sources "Telling A" and "Telling B"
 * (subtype Variant) and "Telling C" (another subtype, listed as not a Variant).
 *
 * The story text is one short paragraph per variant, so the scroll and keyboard
 * checks first append a tall spacer to each column body and cap its height;
 * that makes each body a real scroll container without a second story.
 */

const STORY =
  "/iframe.html?id=folklore-narrativesview--narrative-with-variants&viewMode=story";
const DESKTOP = { width: 1280, height: 800 };
const PHONE_MESSAGE =
  "Side-by-side comparison needs a wider screen. You can still open each variant from the list.";

async function openStory(
  page: Page,
  width = DESKTOP.width,
  height = DESKTOP.height,
): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(STORY);
  await expect(
    page.getByRole("list", { name: "Variants of Cinderella" }),
  ).toBeVisible();
}

/** Ticks a variant in the list. */
async function choose(page: Page, name: string): Promise<void> {
  await page
    .getByRole("checkbox", { name: `Select ${name} for comparison` })
    .check();
}

async function chooseTwoAndWaitForColumns(page: Page): Promise<void> {
  await choose(page, "Telling A");
  await choose(page, "Telling B");
  await page.getByRole("button", { name: "Compare (2)" }).click();
  await expect(
    page.getByRole("heading", { level: 3, name: "Telling A" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Telling B" }),
  ).toBeVisible();
}

/** Makes every column body overflow, so each is a scroll container. */
async function makeColumnsScrollable(page: Page): Promise<void> {
  await page.getByTestId("comparison-column-body").evaluateAll((bodies) => {
    for (const body of bodies) {
      const el = body as HTMLElement;
      el.style.maxHeight = "150px";
      const spacer = document.createElement("div");
      spacer.style.height = "3000px";
      spacer.textContent = "End of text";
      el.appendChild(spacer);
    }
  });
}

function scrollTopOf(locator: Locator): Promise<number> {
  return locator.evaluate((el) => (el as HTMLElement).scrollTop);
}

test("the picker names the narrative and the list shows its variants", async ({
  page,
}) => {
  await openStory(page);

  const picker = page.getByLabel("Narrative", { exact: true });
  await expect(picker).toBeVisible();
  await picker.selectOption("n1");
  await expect(picker).toHaveValue("n1");
  await expect(picker.locator("option:checked")).toContainText("Cinderella");

  const list = page.getByRole("list", { name: "Variants of Cinderella" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(
    list.getByRole("button", { name: "Open Telling A" }),
  ).toBeVisible();
  await expect(list.getByText(/not a Variant/)).toBeVisible();
});

test("a variant opens from the list", async ({ page }) => {
  await openStory(page);
  const open = page.getByRole("button", { name: "Open Telling B" });
  await expect(open).toBeEnabled();
  await open.click();
  // The story's `openInEditor` is a spy; a click with no error is all the
  // browser can show here (the spy call is asserted in the story's play).
  await expect(page.getByRole("heading", { name: "Narratives" })).toBeVisible();
});

test("Compare (N) opens two columns and Back to list keeps the ticks", async ({
  page,
}) => {
  await openStory(page);
  await expect(
    page.getByRole("button", { name: "Compare (0)" }),
  ).toBeDisabled();
  await expect(page.getByTestId("comparison-columns")).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Variants to compare" }),
  ).toHaveCount(0);

  await chooseTwoAndWaitForColumns(page);

  await expect(page.getByTestId("comparison-column-body")).toHaveCount(2);
  await expect(
    page.getByRole("heading", { level: 3, name: "Comparing 2 variants" }),
  ).toBeFocused();
  await expect(
    page.getByRole("list", { name: "Variants of Cinderella" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Back to list" }).click();
  await expect(page.getByRole("button", { name: "Compare (2)" })).toBeFocused();
  await expect(
    page.getByRole("checkbox", { name: "Select Telling A for comparison" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Select Telling B for comparison" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Compare (2)" }).click();
  await expect(
    page.getByRole("region", { name: "Text of Telling A" }),
  ).toContainText("Text of a.");
  await expect(
    page.getByRole("region", { name: "Text of Telling B" }),
  ).toContainText("Text of b.");
});

test("scrolling one column does not scroll the other", async ({ page }) => {
  await openStory(page);
  await chooseTwoAndWaitForColumns(page);
  await makeColumnsScrollable(page);

  const first = page.getByRole("region", { name: "Text of Telling A" });
  const second = page.getByRole("region", { name: "Text of Telling B" });
  expect(await scrollTopOf(first)).toBe(0);
  expect(await scrollTopOf(second)).toBe(0);

  await first.hover();
  await page.mouse.wheel(0, 300);

  await expect.poll(() => scrollTopOf(first)).toBeGreaterThan(0);
  expect(await scrollTopOf(second)).toBe(0);
});

test("keyboard: each column body takes focus in order and scrolls with the keys", async ({
  page,
}) => {
  await openStory(page);
  await chooseTwoAndWaitForColumns(page);
  await makeColumnsScrollable(page);

  const first = page.getByRole("region", { name: "Text of Telling A" });
  const second = page.getByRole("region", { name: "Text of Telling B" });
  await expect(first).toHaveAttribute("tabindex", "0");
  await expect(second).toHaveAttribute("tabindex", "0");

  // Tab from the top of the page until the first column body has focus.
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  let hasReached = false;
  for (let i = 0; i < 40 && !hasReached; i += 1) {
    await page.keyboard.press("Tab");
    hasReached = await first.evaluate((el) => el === document.activeElement);
  }
  expect(hasReached).toBe(true);
  await expect(first).toBeFocused();

  await page.keyboard.press("PageDown");
  await expect.poll(() => scrollTopOf(first)).toBeGreaterThan(0);
  expect(await scrollTopOf(second)).toBe(0);

  // The next stop is the second column's body, and the keys now scroll it.
  await page.keyboard.press("Tab");
  await expect(second).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect.poll(() => scrollTopOf(second)).toBeGreaterThan(0);

  // Shift+Tab goes back to the first.
  await page.keyboard.press("Shift+Tab");
  await expect(first).toBeFocused();
});

test("keyboard: a variant can be chosen with the space bar", async ({
  page,
}) => {
  await openStory(page);
  const box = page.getByRole("checkbox", {
    name: "Select Telling A for comparison",
  });
  await box.focus();
  await page.keyboard.press("Space");
  await expect(box).toBeChecked();
});

test("keyboard: Compare and Back to list are reachable and operable", async ({
  page,
}) => {
  await openStory(page);
  await choose(page, "Telling A");
  await choose(page, "Telling B");
  const compare = page.getByRole("button", { name: "Compare (2)" });
  await compare.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 3, name: "Comparing 2 variants" }),
  ).toBeFocused();
  const back = page.getByRole("button", { name: "Back to list" });
  await back.focus();
  await page.keyboard.press("Enter");
  await expect(compare).toBeFocused();
});

/** The comparison region's right edge and every column's right edge. */
async function edges(
  page: Page,
): Promise<{
  region: number;
  columns: number[];
  hasHScroll: boolean;
  regionScrollsX: boolean;
}> {
  return page.evaluate(() => {
    const region = document.querySelector('section[aria-label="Comparison"]');
    const right = (el: Element): number => el.getBoundingClientRect().right;
    const columns = Array.from(
      document.querySelectorAll('[data-testid="comparison-column-body"]'),
    ).map((body) => right(body.closest("section") as Element));
    const doc = document.documentElement;
    return {
      region: right(region as Element),
      columns,
      hasHScroll: doc.scrollWidth > doc.clientWidth,
      regionScrollsX:
        (region as Element).scrollWidth > (region as Element).clientWidth,
    };
  });
}

for (const count of [2, 4]) {
  test(`1200px wide with ${count} columns: the page does not scroll sideways and any overflow stays inside the comparison region`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(
      count === 4
        ? "/iframe.html?id=folklore-narrativesview--four-variants&viewMode=story"
        : STORY,
    );
    await expect(
      page.getByRole("list", { name: "Variants of Cinderella" }),
    ).toBeVisible();
    const names = ["Telling A", "Telling B", "Telling C", "Telling D"];
    for (const name of names.slice(0, count)) await choose(page, name);
    await page.getByRole("button", { name: `Compare (${count})` }).click();
    await expect(page.getByTestId("comparison-column-body")).toHaveCount(count);

    const measured = await edges(page);
    expect(measured.columns).toHaveLength(count);
    expect(measured.hasHScroll).toBe(false);
    const hasOverflow = measured.columns.some(
      (columnRight) => columnRight > measured.region + 0.5,
    );
    if (count === 2) {
      expect(hasOverflow).toBe(false);
    } else if (hasOverflow) {
      // Overflow is allowed, but only inside the region, never the page.
      expect(measured.regionScrollsX).toBe(true);
    }
  });
}

for (const width of [360, 767]) {
  test(`phone width ${width}px: the message replaces the columns and the list stays`, async ({
    page,
  }) => {
    await openStory(page, width, 800);

    await expect(page.getByText(PHONE_MESSAGE)).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Variants of Cinderella" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open Telling A" }),
    ).toBeVisible();
    await expect(page.getByTestId("comparison-columns")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Compare/ })).toHaveCount(0);
  });
}

test("768px shows the Compare button and not the phone message", async ({
  page,
}) => {
  await openStory(page, 768, 800);
  await expect(page.getByRole("button", { name: "Compare (0)" })).toBeVisible();
  await expect(page.getByText(PHONE_MESSAGE)).toHaveCount(0);
});

test("crossing the 768px boundary keeps the chosen variants", async ({
  page,
}) => {
  await openStory(page);
  await chooseTwoAndWaitForColumns(page);

  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.getByText(PHONE_MESSAGE)).toBeVisible();
  await expect(page.getByTestId("comparison-columns")).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "Select Telling A for comparison" }),
  ).toBeChecked();

  await page.setViewportSize(DESKTOP);
  await expect(page.getByText(PHONE_MESSAGE)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 3, name: "Telling A" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Telling B" }),
  ).toBeVisible();
});
