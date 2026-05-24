import { test, expect } from "@playwright/test";

const STORY = "/iframe.html?id=resourcetree-foldertreepicker--in-dialog";

test("folder list scrolls via wheel inside a modal dialog", async ({
  page,
}) => {
  await page.goto(STORY);

  // Open the picker (trigger shows "Project Root" initially).
  await page.getByRole("button", { name: "resource-parent" }).click();

  const list = page.getByTestId("folder-tree-list");
  await expect(list).toBeVisible();

  // The list must actually overflow its 12rem cap, otherwise the test is moot.
  const overflowing = await list.evaluate(
    (el) => el.scrollHeight > el.clientHeight,
  );
  expect(overflowing).toBe(true);

  // A real wheel event is required: programmatic scrollBy would bypass
  // react-remove-scroll, which is exactly what blocked scrolling before the
  // popover was portaled into the dialog subtree.
  await list.hover();
  const before = await list.evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0, 400);

  await expect
    .poll(async () => list.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(before);
});
