import { test, expect, type Page } from "@playwright/test";

/**
 * A right-click menu opened near the bottom or right edge of the window must
 * stay inside it (Radix flips or shifts it). Measured before the fix: with
 * `.resource-context-menu { position: fixed }` the positioning wrapper
 * measured 0x0, so a menu opened 90px above the bottom of a 700px window ran
 * from 610px to 921px.
 */

const STORIES = [
  {
    name: "editor",
    id: "editor-editorcontextmenu--default",
    trigger: ".ProseMirror",
  },
  {
    name: "resource tree",
    id: "tree-resourcecontextmenu--interactive",
    trigger: '[data-testid="trigger"]',
  },
];

async function menuBoxAfterRightClick(
  page: Page,
  storyId: string,
  trigger: string,
  edge: "bottom" | "right",
) {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`);
  const target = page.locator(trigger).first();
  await target.waitFor();
  if (edge === "bottom") {
    // Push the story down so the trigger's top sits at y = 600.
    const start = await target.boundingBox();
    if (!start) throw new Error("trigger has no box");
    await page.addStyleTag({
      content: `body{padding-top:${16 + 600 - start.y}px !important}`,
    });
  }
  const box = await target.boundingBox();
  if (!box) throw new Error("trigger has no box");
  // Bottom: just inside the trigger's top-left. Right: just inside its right
  // end, which is within 120px of the window's right edge for both stories.
  const x = edge === "bottom" ? box.x + 10 : box.x + box.width - 10;
  await page.mouse.click(x, box.y + 10, { button: "right" });
  const menu = page.locator('[role="menu"]');
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  if (!menuBox) throw new Error("menu has no box");
  return { menuBox, clickX: x };
}

for (const story of STORIES) {
  test(`${story.name} context menu near the bottom edge stays in the window`, async ({
    page,
  }) => {
    const { menuBox: m } = await menuBoxAfterRightClick(
      page,
      story.id,
      story.trigger,
      "bottom",
    );
    expect(m.y).toBeGreaterThanOrEqual(0);
    expect(m.y + m.height).toBeLessThanOrEqual(700 + 1);
  });

  test(`${story.name} context menu near the right edge stays in the window`, async ({
    page,
  }) => {
    const { menuBox: m, clickX } = await menuBoxAfterRightClick(
      page,
      story.id,
      story.trigger,
      "right",
    );
    // The menu is wider than the space right of the click, so it must move.
    expect(1000 - clickX).toBeLessThan(m.width);
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x + m.width).toBeLessThanOrEqual(1000 + 1);
  });
}
