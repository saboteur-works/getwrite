import { test, expect, type Page } from "@playwright/test";

/**
 * Feature 90, Task 35 (F-7). Escape on the Project Type Manager, opened from
 * the settings menu inside the real AppShell (ShellModalCoordinator and the
 * manager's close guard included). A jsdom test of the shell cannot fail on
 * the prompt-Escape case; this spec runs in a browser.
 */
const STORY = "/iframe.html?id=layout-appshellafteropen--default";

async function openManager(page: Page): Promise<void> {
  await page.route("**/api/project-types", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        entries: [
          {
            fileName: "mine.json",
            source: "saved",
            spec: {
              id: "mine",
              name: "Mine",
              description: "",
              folders: [{ name: "Workspace" }],
            },
          },
        ],
        unusable: [],
        savedStatus: "ok",
      },
    });
  });
  await page.goto(STORY);
  await page
    .getByRole("button", { name: "Open project settings menu" })
    .click();
  await page.getByRole("menuitem", { name: "Project Type Manager" }).click();
  await expect(
    page.getByRole("dialog", { name: "Project Type Management" }),
  ).toBeVisible();
}

async function openManagerWithUnsavedEdit(page: Page): Promise<void> {
  await openManager(page);
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("Mine edited");
  await name.focus();
}

test("Escape on the manager with unsaved edits opens the prompt and keeps the draft", async ({
  page,
}) => {
  await openManagerWithUnsavedEdit(page);
  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("dialog", { name: "Unsaved changes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Project Type Management" }),
  ).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Mine edited",
  );
});

test("Escape on the prompt closes only the prompt and keeps the draft", async ({
  page,
}) => {
  await openManagerWithUnsavedEdit(page);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const prompt = page.getByRole("dialog", { name: "Unsaved changes" });
  await expect(prompt).toBeVisible();
  await expect(
    prompt.getByRole("button", { name: "Keep editing" }),
  ).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(prompt).toBeHidden();
  await expect(
    page.getByRole("dialog", { name: "Project Type Management" }),
  ).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Mine edited",
  );
});

test("Escape on the manager with no edits closes it", async ({ page }) => {
  await openManager(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
