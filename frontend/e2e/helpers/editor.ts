import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Shared helpers for driving the real TipTap editor in e2e specs.
 *
 * TipTap creates its editor view in a post-mount effect (immediatelyRender is
 * false), so after a Storybook iframe reload there is a window where the
 * contenteditable exists but keystrokes are dropped. Under multi-worker CPU
 * contention that window widens, which is the root cause of the editor specs'
 * historical flakiness. These helpers wait for a definitive readiness signal
 * and verify that typed text actually commits before the test proceeds.
 */

export function editorBody(page: Page): Locator {
  return page.locator('[role="textbox"], [contenteditable="true"]').first();
}

/**
 * Resolves once TipTap has fully initialized: the menu bar and a known toolbar
 * button are visible and the ProseMirror surface has mounted with its initial
 * document (the empty-doc placeholder decoration only renders after that).
 */
export async function waitForEditorReady(page: Page): Promise<void> {
  await page.locator("#editor-menu-bar").waitFor({ state: "visible" });
  await page
    .getByRole("button", { name: /^Bold$/i })
    .waitFor({ state: "visible" });
  await page
    .locator(".ProseMirror [data-placeholder]")
    .first()
    .waitFor({ state: "attached" });
}

/**
 * Types `text` into a ready editor, replacing any existing content, and does
 * not return until the editor actually contains it. Each retry fully clears
 * and retypes, so a partially-dropped first attempt can't leave stray
 * characters behind (which would corrupt count-based assertions).
 */
export async function typeIntoEditor(page: Page, text: string): Promise<void> {
  const editor = editorBody(page);
  await expect
    .poll(
      async () => {
        await editor.click();
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.press("Delete");
        await page.keyboard.type(text, { delay: 15 });
        return (await editor.innerText()).includes(text);
      },
      { timeout: 15000 },
    )
    .toBe(true);
}
