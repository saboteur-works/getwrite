import { test, expect } from "@playwright/test";

/**
 * Feature 96, Task 25 (spec FR-24). The editor-footer spell-check cue in the
 * built Storybook: paused with a settings action, the quieter not-applied
 * text, and nothing when active or the switch is off.
 */
const story = (name: string): string =>
  `/iframe.html?id=workarea-spellcheckeditorcue--${name}&viewMode=story`;

test("paused shows the cue and the settings button asks the shell to open App Settings", async ({
  page,
}) => {
  await page.goto(story("paused"));
  const status = page.getByRole("status");
  await expect(status).toContainText("Spell check paused");
  await expect(status).toContainText(
    "The spell checker stopped working (worker crashed).",
  );
  const didRequest = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        window.addEventListener(
          "getwrite:open-app-settings",
          () => resolve(true),
          { once: true },
        );
        const button = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent === "Spell check settings",
        );
        button?.click();
        setTimeout(() => resolve(false), 2000);
      }),
  );
  expect(didRequest).toBe(true);
});

test("not applied shows the quieter text and no button", async ({ page }) => {
  await page.goto(story("not-applied"));
  await expect(page.getByRole("status")).toContainText(
    "Your words aren't applied",
  );
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("active, loading and switch-off show nothing", async ({ page }) => {
  for (const name of ["active", "loading", "switch-off"]) {
    await page.goto(story(name));
    await expect(page.getByRole("status")).toBeEmpty();
    await expect(page.getByRole("button")).toHaveCount(0);
  }
});
