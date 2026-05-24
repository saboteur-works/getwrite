import { test, expect } from "@playwright/test";

// The Interactive story echoes the live SearchFilters object as JSON, so we can
// assert that selecting a folder actually updates filter state.
const STORY = "/iframe.html?id=searchbar-searchfilterpanel--interactive-closed";

test("folder picker nested in the filter panel selects a folder", async ({
  page,
}) => {
  await page.goto(STORY);

  // Open the outer filter panel popover.
  await page.getByRole("button", { name: "Toggle search filters" }).click();
  await expect(
    page.getByRole("region", { name: "Search filters" }),
  ).toBeVisible();

  // Open the nested folder picker popover. This is the interaction jsdom can't
  // validate: a Radix Popover opened inside another Popover must not dismiss
  // the outer panel when clicked.
  const folderTrigger = page.getByRole("button", { name: "Filter by folder" });
  await expect(folderTrigger).toHaveText(/All folders/);
  await folderTrigger.click();

  const list = page.getByTestId("folder-tree-list");
  await expect(list).toBeVisible();

  await list.getByText("Act One", { exact: true }).click();

  // Inner popover closes, outer panel stays open, trigger reflects selection,
  // and the echoed filter state carries the folder id.
  await expect(list).toBeHidden();
  await expect(
    page.getByRole("region", { name: "Search filters" }),
  ).toBeVisible();
  await expect(folderTrigger).toHaveText(/Act One/);
  await expect(page.locator("pre").filter({ hasText: "folder" })).toContainText(
    '"folder": "folder-1"',
  );
});
