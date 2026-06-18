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
  const isOverflowing = await list.evaluate(
    (el) => el.scrollHeight > el.clientHeight,
  );
  expect(isOverflowing).toBe(true);

  // Deterministic guard for the actual fix: react-remove-scroll (used by the
  // modal Dialog) only permits wheel scrolling for nodes inside the dialog
  // subtree. The bug was the popover portaling to document.body; the fix
  // portals it into the nearest [role="dialog"]. This assertion can't flake.
  const isInsideDialog = await list.evaluate(
    (el) => !!el.closest('[role="dialog"]'),
  );
  expect(isInsideDialog).toBe(true);

  // Then verify the user-observable outcome with a real wheel event (a
  // programmatic scrollBy would bypass react-remove-scroll entirely). Re-hover
  // and re-dispatch on each poll so a single event isn't raced against
  // hover/paint settling under load; it still fails if scrolling is blocked.
  const before = await list.evaluate((el) => el.scrollTop);

  await expect
    .poll(
      async () => {
        await list.hover();
        await page.mouse.wheel(0, 200);
        return list.evaluate((el) => el.scrollTop);
      },
      { timeout: 15000 },
    )
    .toBeGreaterThan(before);
});

const ROOT_LABEL_STORY =
  "/iframe.html?id=resourcetree-foldertreepicker--in-dialog-custom-root";

test("custom rootLabel picker opens and selects inside a modal dialog", async ({
  page,
}) => {
  await page.goto(ROOT_LABEL_STORY);

  const trigger = page.getByRole("button", { name: "ref-folder" });
  // With no selection the trigger shows the custom rootLabel, not "Project Root".
  await expect(trigger).toHaveText(/Any folder/);

  await trigger.click();
  const list = page.getByTestId("folder-tree-list");
  await expect(list).toBeVisible();

  // The no-selection option inside the popover also reads "Any folder".
  await expect(list.getByText("Any folder")).toBeVisible();

  // Selecting a folder closes the popover and updates the trigger label.
  await list.getByText("Chapter 3", { exact: true }).click();
  await expect(list).toBeHidden();
  await expect(trigger).toHaveText(/Chapter 3/);
});
