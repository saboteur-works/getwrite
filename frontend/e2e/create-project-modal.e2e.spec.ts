import { test, expect } from "@playwright/test";

const OPEN_STORY = "/iframe.html?id=start-createprojectmodal--open";

test("create project modal cancel button closes the dialog", async ({
  page,
}) => {
  await page.goto(OPEN_STORY);

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await page.getByRole("button", { name: /cancel/i }).click();

  await expect(dialog).not.toBeVisible({ timeout: 2000 });
});

test("create project modal shows validation error on empty submit", async ({
  page,
}) => {
  await page.goto(OPEN_STORY);

  // The Create button is disabled in this story because the mocked project
  // types omit folders[]. Submit via Enter, which bypasses the disabled
  // button and still triggers handleSubmit's validation branch.
  const nameInput = page.locator("input").first();
  await expect(nameInput).toBeVisible();
  await nameInput.fill("");
  await nameInput.press("Enter");

  await expect(page.getByText(/please enter a project name/i)).toBeVisible();
});

test("create project modal does not emit on empty submit", async ({ page }) => {
  await page.goto(OPEN_STORY);

  const nameInput = page.locator("input").first();
  await nameInput.fill("");
  await nameInput.press("Enter");

  const createdPayload = page.locator('[data-testid="created-payload"]');
  await expect(createdPayload).toBeEmpty();
});

test("create project modal switches project type via select", async ({
  page,
}) => {
  await page.goto(OPEN_STORY);

  const select = page.locator("select").first();
  await expect(select).toBeVisible();
  await expect(select.locator("option")).toHaveCount(2, { timeout: 5000 });

  await select.selectOption("short");
  await expect(select).toHaveValue("short");
});

test("create project modal filter narrows project type options", async ({
  page,
}) => {
  await page.goto(OPEN_STORY);

  const filter = page.getByLabel(/filter project types/i);
  await expect(filter).toBeVisible();

  const select = page.locator("select").first();
  await expect(select.locator("option")).toHaveCount(2, { timeout: 5000 });

  // "Short Story" matches only the short entry (novel's name/description don't
  // contain this phrase).
  await filter.fill("Short Story");
  await expect(select.locator("option")).toHaveCount(1);
  await expect(select.locator("option").first()).toContainText(/short story/i);

  await filter.fill("");
  await expect(select.locator("option")).toHaveCount(2);
});

test("create project modal emits payload with selected type", async ({
  page,
}) => {
  await page.goto(OPEN_STORY);

  const select = page.locator("select").first();
  await expect(select.locator("option")).toHaveCount(2, { timeout: 5000 });
  await select.selectOption("short");

  const nameInput = page.locator("input").first();
  await nameInput.fill("Typed Project");
  await nameInput.press("Enter");

  const createdPayload = page.locator('[data-testid="created-payload"]');
  await expect(createdPayload).not.toBeEmpty({ timeout: 2000 });
  const payloadText = await createdPayload.textContent();
  expect(payloadText).toContain('"name":"Typed Project"');
  expect(payloadText).toContain('"projectType":"short"');
});
