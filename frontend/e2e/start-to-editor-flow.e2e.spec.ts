import { test, expect, type Page } from "@playwright/test";

const FLOW_STORY = "/iframe.html?id=start-startpage--open-project-flow";

/**
 * The OpenProjectFlow story installs its window.fetch mock and exposes
 * window.__openFlowMockState during its first client render. Waiting for that
 * object guarantees the story has mounted (and its onOpen handler is wired)
 * before we click — clicking earlier silently drops the event under load.
 */
async function waitForFlowReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      !!(window as unknown as { __openFlowMockState?: unknown })
        .__openFlowMockState,
  );
  await expect(
    page.getByRole("heading", { name: /disk project/i }),
  ).toBeVisible();
}

/**
 * Clicks "Open Disk Project" until the opened-project view appears. A click
 * that lands before hydration is a no-op, so we retry; once the marker is up
 * the start-page button is gone, so the guard stops us from clicking again.
 */
async function openDiskProject(page: Page): Promise<void> {
  const openBtn = page.getByRole("button", { name: /open disk project/i });
  const marker = page.locator('[data-testid="project-opened-marker"]');
  await expect(async () => {
    if (await marker.isVisible()) return;
    if (await openBtn.isVisible()) await openBtn.click();
    await expect(marker).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15000 });
}

test("clicking Open Project transitions to the opened-project view", async ({
  page,
}) => {
  await page.goto(FLOW_STORY);
  await waitForFlowReady(page);

  // Opened marker absent before the click.
  await expect(
    page.locator('[data-testid="project-opened-marker"]'),
  ).toHaveCount(0);

  await openDiskProject(page);

  await expect(page.locator('[data-testid="opened-project-name"]')).toHaveText(
    "Opened Manuscript",
  );
});

test("opened-project view lists the resources returned by the API", async ({
  page,
}) => {
  await page.goto(FLOW_STORY);
  await waitForFlowReady(page);
  await openDiskProject(page);

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
  await waitForFlowReady(page);

  await openDiskProject(page);

  // The fetch mock captures the last request body on window.__openFlowMockState.
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
  await waitForFlowReady(page);

  const openBtn = page.getByRole("button", { name: /open disk project/i });
  const errorProbe = page.locator('[data-testid="open-error"]');

  // Re-arm the fail flag on every attempt (the mock consumes it per request)
  // and re-click; a click dropped before hydration leaves the error empty, so
  // retrying drives the failure deterministically without ever succeeding.
  await expect(async () => {
    await page.evaluate(() => {
      const w = window as unknown as {
        __openFlowMockState?: { shouldFailNextOpen: boolean };
      };
      if (w.__openFlowMockState)
        w.__openFlowMockState.shouldFailNextOpen = true;
    });
    await openBtn.click();
    await expect(errorProbe).toHaveText(/project not found/i, {
      timeout: 1500,
    });
  }).toPass({ timeout: 15000 });

  // Still on the start page; opened marker should not have appeared.
  await expect(
    page.locator('[data-testid="project-opened-marker"]'),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /disk project/i }),
  ).toBeVisible();
});
