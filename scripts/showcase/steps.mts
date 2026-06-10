/**
 * Reusable Playwright setup-step primitives for the showcase runner.
 *
 * Each step drives the SPA into a specific state before capture. The app is
 * a client-state SPA — navigation between projects and resources happens
 * through UI interactions rather than URL changes, so these primitives do most
 * of the scene setup work.
 */

import type { Page } from "playwright";
import type { SceneStep } from "./types.mts";

/**
 * Executes a single scene step on the given Playwright page.
 * Throws if the step fails so the runner can surface the error.
 */
export async function runStep(page: Page, step: SceneStep): Promise<void> {
  switch (step.step) {
    case "selectProject": {
      // The start page lists projects with an "Open <name>" button.
      const btn = page.getByRole("button", {
        name: `Open ${step.projectName}`,
        exact: true,
      });
      await btn.waitFor({ state: "visible", timeout: 15_000 });
      await btn.click();
      // Wait for the resource tree to appear, signalling the project loaded.
      await page
        .getByRole("tree", { name: "Resource tree" })
        .waitFor({ state: "visible", timeout: 20_000 });
      break;
    }

    case "openResource": {
      // Look for a button containing the title text — it may appear in the
      // resource tree (if the parent folder is expanded) OR in the Recent Files
      // panel shown in the work area. The Recent Files button's accessible name
      // includes type and date text, so we match by substring with filter().
      const btn = page.locator("button").filter({ hasText: step.title }).first();
      await btn.waitFor({ state: "visible", timeout: 10_000 });
      await btn.click();
      // Wait for the edit-view shell to confirm a resource opened.
      await page
        .locator('[data-testid="editview-shell"]')
        .waitFor({ state: "visible", timeout: 15_000 });
      break;
    }

    case "click": {
      await page.locator(step.selector).waitFor({ state: "visible", timeout: 10_000 });
      await page.locator(step.selector).click();
      break;
    }

    case "waitFor": {
      await page.locator(step.selector).waitFor({ state: "visible", timeout: 15_000 });
      break;
    }

    case "wait": {
      await page.waitForTimeout(step.ms);
      break;
    }

    case "hideCursor": {
      // Move the cursor well off-screen so it does not appear in screenshots.
      await page.mouse.move(-100, -100);
      break;
    }

    default: {
      const _exhaustive: never = step;
      throw new Error(`Unknown step: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Runs all steps for a scene in order.
 */
export async function runSteps(page: Page, steps: SceneStep[]): Promise<void> {
  for (const step of steps) {
    await runStep(page, step);
  }
}
