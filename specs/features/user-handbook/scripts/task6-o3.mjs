// Task 6, web build: views/organizer.md rows O-18..O-22 (Reordering cards; pointer drag by Playwright mouse). Run OUTSIDE the sandbox.
import { reloadProject, withWeb, say, J, bodyText, step, createProject, createNode, treeClick, typeInto, expandAll, cards, treeRows, outline, sidecars } from "./task6-lib.mjs";
const names = async (page) => (await cards(page)).map((c) => c.title);
const orderIdx = (h) => J(sidecars(h).map((s) => `${s.json.name}=${s.json.orderIndex}`).sort());
const handle = (page, name) => page.locator(`[aria-labelledby^='res-']:has(h3:has-text("${name}")) button[aria-label='Drag to reorder']`).first();
const live = (page) => page.evaluate(() => [...document.querySelectorAll("[aria-live]")].map((e) => e.textContent.trim()).filter(Boolean));
const tree = async (page) => { await expandAll(page); return J(outline(await treeRows(page))); };
async function drag(page, from, to, dx = 0) {
  const a = await handle(page, from).boundingBox(); const b = await page.locator(`[aria-labelledby^='res-']:has(h3:has-text("${to}"))`).first().boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  const tx = b.x + 20 + dx, ty = b.y + b.height / 2;
  for (let i = 1; i <= 12; i++) { await page.mouse.move(a.x + (tx - a.x) * i / 12, a.y + (ty - a.y) * i / 12); await page.waitForTimeout(40); }
  await page.waitForTimeout(300); await page.mouse.up(); await page.waitForTimeout(1500);
}
await withWeb("t6-o3", {}, async ({ h, page }) => {
  await createProject(page, h, "Ord", "Blank");
  for (const n of ["R1", "R2", "R3", "R4"]) await createNode(page, n, "text");
  await reloadProject(page, "Ord");
  await page.locator('[role=treeitem][aria-label="Workspace"]').first().click(); await page.waitForTimeout(1500);
  say("start: cards=" + J(await names(page)) + " tree=" + await tree(page) + " orderIndex=" + orderIdx(h));
  await page.locator('[role=treeitem][aria-label="Workspace"]').first().click(); await page.waitForTimeout(1200);
  await step("handle attrs", async () => {
    say("O-18 handle attrs: " + J(await handle(page, "R1").evaluate((e) => [...e.attributes].map((a) => `${a.name}=${a.value.slice(0, 60)}`))));
  });
  await step("O-18 pointer drag", async () => {
    await drag(page, "R3", "R1");
    say("O-18 after dragging R3's handle onto R1: cards=" + J(await names(page)) + " orderIndex=" + orderIdx(h));
    say("O-19 tree now (no reload): " + await tree(page));
    await page.locator('[role=treeitem][aria-label="Workspace"]').first().click(); await page.waitForTimeout(1200);
    await reloadProject(page, "Ord");
    say("O-19 tree after reload: " + await tree(page));
    await page.locator('[role=treeitem][aria-label="Workspace"]').first().click(); await page.waitForTimeout(1500);
    say("O-18 cards after reload: " + J(await names(page)));
    await drag(page, "R1", "R4", 150);
    say("O-18 after dragging R1's handle to the right of R4: cards=" + J(await names(page)) + " orderIndex=" + orderIdx(h));
  });
  await step("O-20 keyboard", async () => {
    await handle(page, "R2").focus();
    say("O-20 focused element: " + J(await page.evaluate(() => document.activeElement.getAttribute("aria-label"))));
    const before = await names(page);
    await page.keyboard.press("Space"); await page.waitForTimeout(500);
    say("O-20 live region after Space: " + J(await live(page)));
    await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(500);
    say("O-20 live region after ArrowLeft: " + J(await live(page)));
    await page.keyboard.press("Space"); await page.waitForTimeout(1500);
    say("O-20 live region after dropping with Space: " + J(await live(page)));
    say("O-20 cards before=" + J(before) + " after=" + J(await names(page)) + " orderIndex=" + orderIdx(h));
    await handle(page, "R2").focus();
    await page.keyboard.press("Space"); await page.waitForTimeout(300); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300); await page.keyboard.press("Escape"); await page.waitForTimeout(800);
    say("O-20 Space, ArrowRight, Escape: cards=" + J(await names(page)) + " live=" + J(await live(page)));
  });
  await step("O-21/22 filter active", async () => {
    await page.click("button:has-text('Filters')"); await page.waitForTimeout(500);
    await page.fill("input[aria-label='Minimum words']", "0"); await page.waitForTimeout(800);
    say("O-21 filter active: cards=" + J(await names(page)));
    say("O-22 handle attrs while filtered: " + J(await handle(page, "R1").evaluate((e) => [...e.attributes].map((a) => `${a.name}=${a.value.slice(0, 80)}`))));
    say("O-22 text near handle: " + J(await page.evaluate(() => { const d = document.querySelector("[aria-labelledby^='res-'] [id*=reorder], [aria-labelledby^='res-'] [id*=disabled]"); return d ? d.textContent : "(no element with id containing reorder/disabled)"; })));
    const before = await names(page);
    await drag(page, "R1", "R3");
    say("O-21 pointer drag while filtered: before=" + J(before) + " after=" + J(await names(page)) + " orderIndex=" + orderIdx(h));
    await handle(page, "R1").focus().catch(() => {});
    say("O-21 focus on the handle while filtered -> active element: " + J(await page.evaluate(() => document.activeElement.getAttribute("aria-label") || document.activeElement.tagName)));
    await page.keyboard.press("Space"); await page.waitForTimeout(300); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300); await page.keyboard.press("Space"); await page.waitForTimeout(800);
    say("O-21 keyboard attempt while filtered: cards=" + J(await names(page)));
    await page.hover("[aria-labelledby^='res-'] button[aria-label='Drag to reorder']"); await page.waitForTimeout(1200);
    say("O-22 on hover: " + J(await page.evaluate(() => [...document.querySelectorAll("[role=tooltip], .react-tooltip")].map((e) => e.textContent))));
  });
});
