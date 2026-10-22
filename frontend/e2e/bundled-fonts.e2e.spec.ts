import { test, expect, type Page } from "@playwright/test";

/**
 * Feature 91 (FR-3, FR-6, FR-18): project fonts render from the bundled faces
 * with every request that is not to the Storybook origin aborted, and without
 * any toolbar interaction. Extends no existing editor spec because none
 * routes requests; recorded in tasks.md Task 23.
 */

const STORY = "/iframe.html?id=workarea-editview--bundled-project-fonts";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

interface NetworkLog {
  blocked: string[];
  consoleErrors: string[];
}

async function blockForeignOrigins(
  page: Page,
  origin: string,
  log: NetworkLog,
): Promise<void> {
  page.on("console", (message) => {
    if (message.type() === "error") log.consoleErrors.push(message.text());
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith("data:")) {
      await route.continue();
      return;
    }
    log.blocked.push(url);
    await route.abort();
  });
}

/** Ready when the toolbar and the seeded heading are rendered (the helper's placeholder wait only fits an empty document). */
async function waitForEditorContent(page: Page): Promise<void> {
  await page.locator("#editor-menu-bar").waitFor({ state: "visible" });
  await page.locator(".ProseMirror h1").waitFor({ state: "visible" });
}

async function computedFamily(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily);
}

test.describe("Bundled project fonts with the network blocked", () => {
  test("body and h1 compute the project families and their faces load", async ({
    page,
    baseURL,
  }) => {
    const log: NetworkLog = { blocked: [], consoleErrors: [] };
    await blockForeignOrigins(page, new URL(baseURL ?? page.url()).origin, log);

    await page.goto(STORY);
    await waitForEditorContent(page);
    await expect(page.locator(".ProseMirror h1")).toHaveText("Bundled heading");

    expect(await computedFamily(page, ".ProseMirror p")).toContain(
      "Merriweather",
    );
    expect(await computedFamily(page, ".ProseMirror h1")).toContain(
      "Playfair Display",
    );

    for (const [family, selector] of [
      ["Merriweather", ".ProseMirror p"],
      ["Playfair Display", ".ProseMirror h1"],
    ] as const) {
      await expect
        .poll(
          () =>
            page.evaluate(
              async ([name, sel]) => {
                const el = document.querySelector(sel);
                if (!el) return false;
                // No explicit load(): the paragraph's own rendering must have
                // pulled the face in, as it does for a writer.
                await document.fonts.ready;
                const weight = getComputedStyle(el).fontWeight;
                const isLoaded = Array.from(document.fonts).some(
                  (face) =>
                    face.family.replace(/"/g, "") === name &&
                    face.weight === weight &&
                    face.status === "loaded",
                );
                return (
                  isLoaded &&
                  document.fonts.check(
                    `${weight} 16px "${name}"`,
                    el.textContent ?? "",
                  )
                );
              },
              [family, selector],
            ),
          { message: `${family} reports loaded` },
        )
        .toBe(true);
    }

    const fontHostRequests = log.blocked.filter((url) =>
      FONT_HOSTS.some((host) => url.includes(host)),
    );
    expect(fontHostRequests).toEqual([]);
    expect(log.blocked).toEqual([]);
    expect(log.consoleErrors.filter((text) => /font/i.test(text))).toEqual([]);
  });

  test("a blocked face is reported by family name, not substituted silently", async ({
    page,
  }) => {
    const log: NetworkLog = { blocked: [], consoleErrors: [] };
    page.on("console", (message) => {
      if (message.type() === "error") log.consoleErrors.push(message.text());
    });
    await page.route("**/*merriweather*.woff*", (route) => route.abort());

    await page.goto(STORY);
    await waitForEditorContent(page);

    await expect
      .poll(() =>
        log.consoleErrors.some((text) =>
          text.includes("Bundled font failed to load: Merriweather"),
        ),
      )
      .toBe(true);
  });
});
