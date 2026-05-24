import { test, expect } from "@playwright/test";

const FLOW_STORY = "/iframe.html?id=start-startpage--open-project-flow";

test("clicking Open Project transitions to the opened-project view", async ({
  page,
}) => {
  await page.goto(FLOW_STORY);

  // Initially: start page shows the disk project card; opened marker absent.
  await expect(
    page.getByRole("heading", { name: /disk project/i }),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="project-opened-marker"]'),
  ).toHaveCount(0);

  await page.getByRole("button", { name: /open disk project/i }).click();

  await expect(
    page.locator('[data-testid="project-opened-marker"]'),
  ).toBeVisible();
  await expect(page.locator('[data-testid="opened-project-name"]')).toHaveText(
    "Opened Manuscript",
  );
});

test("opened-project view lists the resources returned by the API", async ({
  page,
}) => {
  await page.goto(FLOW_STORY);
  await page.getByRole("button", { name: /open disk project/i }).click();

  await expect(
    page.locator('[data-testid="opened-resource-count"]'),
  ).toHaveText("2");
  await expect(
    page.locator('[data-testid="opened-resource-open-res-1"]'),
  ).toHaveText("Opening Scene");
  await expect(
    page.locator('[data-testid="opened-resource-open-res-2"]'),
  ).toHaveText("Inciting Incident");
});

test("Open Project posts the project rootPath to /api/project", async ({
  page,
}) => {
  await page.goto(FLOW_STORY);

  await page.getByRole("button", { name: /open disk project/i }).click();

  // The fetch mock captures the last request body on window.__openFlowMockState.
  // Wait until it is populated, then assert on the projectPath field.
  await expect(
    page.locator('[data-testid="project-opened-marker"]'),
  ).toBeVisible();

  const lastPayload = await page.evaluate(
    () =>
      (
        window as unknown as {
          __openFlowMockState?: { lastOpenPayload: string | null };
        }
      ).__openFlowMockState?.lastOpenPayload ?? null,
  );
  expect(lastPayload).not.toBeNull();
  const parsed = JSON.parse(lastPayload as string);
  expect(parsed.projectPath).toBe("/tmp/projects/disk-proj");
});

test("API failure surfaces an error and keeps the user on the start page", async ({
  page,
}) => {
  await page.goto(FLOW_STORY);

  // Wait until the start-page card is rendered so we know the story (and the
  // window.fetch mock it installs) is fully active before we mutate its state.
  await expect(
    page.getByRole("heading", { name: /disk project/i }),
  ).toBeVisible();

  // Arm the mock to fail the next /api/project request, then click open.
  await page.evaluate(() => {
    const w = window as unknown as {
      __openFlowMockState?: { shouldFailNextOpen: boolean };
    };
    if (w.__openFlowMockState) w.__openFlowMockState.shouldFailNextOpen = true;
  });
  await page.getByRole("button", { name: /open disk project/i }).click();

  const errorProbe = page.locator('[data-testid="open-error"]');
  await expect(errorProbe).toHaveText(/project not found/i, { timeout: 2000 });

  // Still on the start page; opened marker should not have appeared.
  await expect(
    page.locator('[data-testid="project-opened-marker"]'),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /disk project/i }),
  ).toBeVisible();
});
