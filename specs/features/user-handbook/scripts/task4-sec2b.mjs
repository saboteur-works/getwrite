// Task 4, web build: does saving Body Text Styles change the saved heading styles? (observation for H-06 / A-09 warnings). Run OUTSIDE the sandbox.
import { withWeb, say, J, bodyText, step, createDoc, openDoc, pm, newProjectWithDoc, reopenDoc } from "./task4-lib.mjs";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
const dlg = (page) => page.locator("[role=dialog]");
const vis = (loc) => loc.filter({ visible: true });
async function openSettings(page) {
  await page.click('button[aria-label="Open project settings menu"]');
  await page.click("text=Project Settings");
  await page.waitForTimeout(600);
  await dlg(page).locator('[role=tab]:has-text("Editor")').click();
  await page.waitForTimeout(500);
}
const cfg = (h) => { const d = readdirSync(h.projectsDir)[0]; return JSON.parse(readFileSync(path.join(h.projectsDir, d, "project.json"), "utf8")).config.editorConfig; };
const h1 = (page) => page.evaluate(() => { const e = document.querySelector(".ProseMirror h1"); const c = e && getComputedStyle(e); return c && { size: c.fontSize, weight: c.fontWeight }; });
await withWeb("t4sec2b", {}, async ({ h, page }) => {
  await newProjectWithDoc(page, h, "Save Order", "Doc One");
  await pm(page).click();
  await page.keyboard.type("Title line");
  await page.click('button[aria-label="Heading 1"]');
  await page.waitForTimeout(300);
  say(`start: editorConfig keys=${J(Object.keys(cfg(h)))}; headings keys=${J(Object.keys(cfg(h).headings))}; h1=${J(await h1(page))}`);
  await openSettings(page);
  await dlg(page).locator('input[aria-label="H1 Font Size"]').fill("60");
  await vis(dlg(page).getByRole("button", { name: "Save Changes", exact: true })).first().click();
  await page.waitForTimeout(800);
  say(`after headings Save (H1 size 60): headings keys=${J(Object.keys(cfg(h).headings))} h1.fontSize=${cfg(h).headings.h1?.fontSize}; body=${J(cfg(h).body)}; editor h1=${J(await h1(page))}`);
  await dlg(page).locator('input[aria-label="Font Size"]').fill("18px");
  await vis(dlg(page).getByRole("button", { name: "Save Changes", exact: true })).nth(1).click();
  await page.waitForTimeout(900);
  say(`after Body Text Styles Save (font size 18px): headings=${J(cfg(h).headings)}; body=${J(cfg(h).body)}; editor h1=${J(await h1(page))}`);
  say(`Heading input in the open dialog now: H1 Font Size=${J(await dlg(page).locator('input[aria-label="H1 Font Size"]').inputValue())}`);
  await page.keyboard.press("Escape");
  await reopenDoc(page, "Save Order", "Doc One");
  say(`after reload: editor h1=${J(await h1(page))}`);
  await openSettings(page);
  say(`after reload, dialog: H1 Font Size=${J(await dlg(page).locator('input[aria-label="H1 Font Size"]').inputValue())}`);
  // reverse order in a second project: body first, then headings
});
