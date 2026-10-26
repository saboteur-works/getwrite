import { test, expect, type Page } from "@playwright/test";

/**
 * Feature 96, Task 21. The user word list ("My dictionary") as far as the
 * built Storybook reaches it: the App Settings section, the persistent
 * not-applied notice, and the flagged-word menu entry. The stories preload the
 * store, so the specs that need the server answer `/api/user-word-list` with
 * `page.route`. Hosted, desktop and Android behaviour is covered elsewhere.
 */
const story = (id: string): string => `/iframe.html?id=${id}&viewMode=story`;

const SECTION = "layout-mydictionarysettingstab";
const SETTING = "appsettings-spellchecksetting";
const MENU = "editor-editorcontextmenu";

async function openFlaggedWordMenu(page: Page) {
  const flagged = page.getByText("wrold", { exact: true });
  await flagged.waitFor();
  await flagged.click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}

test("populated section lists words and removing one moves focus to the next remove button", async ({
  page,
}) => {
  const methods: string[] = [];
  await page.route("**/api/user-word-list", async (route) => {
    methods.push(route.request().method());
    await route.fulfill({ json: ["Apple", "zephyr"] });
  });
  await page.goto(story(`${SECTION}--populated`));

  await expect(
    page.getByRole("heading", { name: "My dictionary (3)" }),
  ).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveText([
    "Apple",
    "mango",
    "zephyr",
  ]);

  await page
    .getByRole("button", { name: "Remove mango from my dictionary" })
    .click();

  await expect(
    page.getByRole("heading", { name: "My dictionary (2)" }),
  ).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveText(["Apple", "zephyr"]);
  await expect(
    page.getByRole("button", { name: "Remove zephyr from my dictionary" }),
  ).toBeFocused();
  expect(methods).toContain("DELETE");
});

test("load-failed section shows the alert and Retry, then recovers when the read succeeds", async ({
  page,
}) => {
  await page.route("**/api/user-word-list", async (route) => {
    await route.fulfill({ json: ["recovered"] });
  });
  await page.goto(story(`${SECTION}--load-failed`));

  await expect(page.getByRole("alert")).toContainText(
    "Your dictionary could not be loaded (unreadable).",
  );
  await expect(page.getByText("No words in your dictionary yet.")).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "Retry" }).click();

  await expect(page.getByRole("listitem")).toHaveText(["recovered"]);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Continue without my dictionary leaves a persistent notice with no dismiss control", async ({
  page,
}) => {
  await page.goto(story(`${SETTING}--user-list-read-failed`));

  const status = page.getByRole("status");
  await expect(status).toContainText(
    "Your dictionary could not be loaded (unreadable).",
  );

  await page
    .getByRole("button", { name: "Continue without my dictionary" })
    .click();

  await expect(status).toContainText("Your own words are not being applied.");
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Continue without my dictionary" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /dismiss|close/i }),
  ).toHaveCount(0);
  await expect(status.getByRole("button")).toHaveCount(0);
});

test("the not-applied notice is shown at once and stays", async ({ page }) => {
  await page.goto(story(`${SETTING}--user-words-not-applied`));
  const status = page.getByRole("status");
  await expect(status).toContainText("Your own words are not being applied.");
  await page.waitForTimeout(500);
  await expect(status).toContainText("Your own words are not being applied.");
  await expect(status.getByRole("button")).toHaveCount(0);
});

test("paired device section offers no add form and no list", async ({
  page,
}) => {
  await page.goto(story(`${SECTION}--paired`));

  await expect(page.getByText(/not available on this device/)).toBeVisible();
  await expect(page.getByLabel("Add a word")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add word" })).toHaveCount(0);
  await expect(page.getByRole("list")).toHaveCount(0);
});

test("flagged-word menu offers Add to my dictionary on an unpaired device", async ({
  page,
}) => {
  await page.goto(story(`${MENU}--spelling-suggestions`));
  const menu = await openFlaggedWordMenu(page);
  await expect(
    menu.getByRole("menuitem", { name: "Add to my dictionary" }),
  ).toBeVisible();
});

test("paired device flagged-word menu has no Add to my dictionary entry", async ({
  page,
}) => {
  await page.goto(story(`${MENU}--spelling-paired-no-my-dictionary`));
  const menu = await openFlaggedWordMenu(page);
  await expect(
    menu.getByRole("menuitem", { name: "Add to project dictionary" }),
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Add to my dictionary" }),
  ).toHaveCount(0);
});
