import { test, expect } from "@playwright/test";

const DEFAULT_STORY = "/iframe.html?id=start-startpage--default";
const EMPTY_STORY = "/iframe.html?id=start-startpage--no-projects";
const INTERACTIVE_STORY = "/iframe.html?id=start-startpage--interactive";

test("start page renders project card with name and counts", async ({
  page,
}) => {
  await page.goto(DEFAULT_STORY);

  const card = page.getByRole("article", { name: /example project/i });
  await expect(card).toBeVisible();

  await expect(
    card.getByRole("heading", { name: "Example Project" }),
  ).toBeVisible();
  // Default story: 3 resources (text, image, audio) and 1 folder
  await expect(card.getByText(/3 resources · 1 folder/i)).toBeVisible();
});

test("start page hero stats reflect totals", async ({ page }) => {
  await page.goto(DEFAULT_STORY);

  await expect(page.getByText(/1 active project/i)).toBeVisible();
  await expect(page.getByText(/3 writing assets/i)).toBeVisible();
  await expect(page.getByText(/1 folders organized/i)).toBeVisible();
});

test("start page hero copy includes featured project name", async ({
  page,
}) => {
  await page.goto(DEFAULT_STORY);

  await expect(
    page.getByText(/pick up where you left off in example project/i),
  ).toBeVisible();
});

test("start page empty state shows when no projects", async ({ page }) => {
  await page.goto(EMPTY_STORY);

  await expect(
    page.getByRole("heading", { name: /no projects yet/i }),
  ).toBeVisible();
  await expect(
    page.getByText(/create your first project to begin writing/i),
  ).toBeVisible();
  // Button has aria-label="Start a new project" — locate by visible text instead.
  await expect(
    page.locator("button").filter({ hasText: /create the first project/i }),
  ).toBeVisible();
  await expect(page.getByText(/your next manuscript/i)).toBeVisible();
});

test("start page hero button opens create project modal", async ({ page }) => {
  await page.goto(DEFAULT_STORY);

  // Two buttons share label/aria — the hero button is in <aside>
  const heroCreate = page
    .getByRole("button", { name: /start a new project/i })
    .first();
  await expect(heroCreate).toBeVisible();
  await heroCreate.click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /create project/i }),
  ).toBeVisible();
});

test("start page empty-state button opens create project modal", async ({
  page,
}) => {
  await page.goto(EMPTY_STORY);

  await page
    .locator("button")
    .filter({ hasText: /create the first project/i })
    .click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /create project/i }),
  ).toBeVisible();
});

test("start page open project button fires onOpen with project path", async ({
  page,
}) => {
  await page.goto(INTERACTIVE_STORY);

  const lastAction = page.locator('[data-testid="last-action"]');
  const lastPayload = page.locator('[data-testid="last-payload"]');

  await page.getByRole("button", { name: /open newer project/i }).click();

  await expect(lastAction).toHaveText("open");
  await expect(lastPayload).toHaveText("/tmp/projects/proj-new");
});

test("start page three-dot menu opens manage actions", async ({ page }) => {
  await page.goto(INTERACTIVE_STORY);

  // Two cards → two menu triggers; pick the first (sorted newest first → Newer Project)
  await page.locator('[aria-haspopup="menu"]').first().click();

  await expect(page.getByRole("menuitem", { name: /rename/i })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /package/i })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /delete/i })).toBeVisible();
});

test("start page sorts cards by latest activity", async ({ page }) => {
  await page.goto(INTERACTIVE_STORY);

  const cardTitles = page.locator("article h3");
  await expect(cardTitles).toHaveCount(2);
  await expect(cardTitles.nth(0)).toHaveText(/newer project/i);
  await expect(cardTitles.nth(1)).toHaveText(/older project/i);
});

test("start page card shows project root path and stub project type", async ({
  page,
}) => {
  await page.goto(INTERACTIVE_STORY);

  const newerCard = page.getByRole("article", { name: /newer project/i });
  await expect(newerCard.getByText("/tmp/projects/proj-new")).toBeVisible();
  // No projectType set on the story projects → falls back to "Custom template"
  await expect(newerCard.getByText(/custom template/i)).toBeVisible();
});

test("start page reflects two-project totals in hero stats", async ({
  page,
}) => {
  await page.goto(INTERACTIVE_STORY);

  await expect(page.getByText(/2 active projects/i)).toBeVisible();
  await expect(page.getByText(/3 writing assets/i)).toBeVisible();
  await expect(page.getByText(/3 folders organized/i)).toBeVisible();
});
