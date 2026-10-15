// Shared helpers for the Task 5 runs (web build, Playwright). Builds on task4-lib.mjs.
export * from "./task4-lib.mjs";
import { bodyText, say, J, openDoc, expandAll } from "./task4-lib.mjs";
export async function openSettings(page, tab) {
  await page.click('button[aria-label="Open project settings menu"]');
  await page.click("text=Project Settings");
  await page.waitForTimeout(600);
  if (tab) { await page.click(`[role=dialog] [role=tab]:has-text("${tab}"), dialog [role=tab]:has-text("${tab}")`); await page.waitForTimeout(600); }
}
export async function closeSettings(page) {
  await page.locator("[role=dialog] button:has-text('Close'), dialog button:has-text('Close')").first().click();
  await page.waitForTimeout(600);
}
export const dialogText = (page) => page.evaluate(() => { const d = document.querySelector("[role=dialog], dialog"); return d ? d.innerText : ""; });
/** Sidebar text: everything after the last "METADATA" heading line of the body text. */
export async function sidebarText(page) {
  const t = await bodyText(page);
  const i = t.lastIndexOf("\nMETADATA\n");
  return i < 0 ? "(no METADATA heading)" : t.slice(i + 10);
}
export async function addSidebarField(page, name, label, type, group) {
  await page.click('button[aria-label="add-metadata-field"]');
  await page.fill('input[aria-label="field-name"]', name);
  await page.fill('input[aria-label="field-label"]', label);
  await page.selectOption('select[aria-label="field-type"]', { label: type });
  if (group) await page.selectOption('select[aria-label="field-group"]', { label: group });
  await page.locator("form button[type=submit]").click();
  await page.waitForTimeout(1500);
}
export async function createNode(page, title, type, via = "Workspace", file) {
  await page.click(`button[aria-label="${via} options"]`);
  await page.click(".resource-context-menu-item:has-text('Create')");
  await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill(title);
  if (type && type !== "text") await page.selectOption("select", type);
  if (file) await page.setInputFiles("input[type=file]", file);
  await page.locator("[role=dialog] button:has-text('Create'), dialog button:has-text('Create')").last().click();
  await page.waitForTimeout(2500);
}
export const treeClick = async (page, name) => {
  const ti = page.locator(`[role=treeitem][aria-label="${name}"]`);
  if (!(await ti.count())) await expandAll(page);
  if (await ti.count()) await ti.first().click(); else await page.click(`text=${name} >> nth=0`);
  await page.waitForTimeout(800);
  for (let i = 0; i < 20; i++) { const t = await sidebarText(page); if (t.toUpperCase().startsWith(name.toUpperCase() + "\n")) break; await page.waitForTimeout(300); }
  await page.waitForTimeout(1200);
};
export const ls = (p) => import("node:fs").then((fs) => fs.readdirSync(p));
export const readJson = (p) => import("node:fs").then((fs) => JSON.parse(fs.readFileSync(p, "utf8")));
export { say, J, bodyText };
import { walk } from "./task4-lib.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
export const sidecars = (h) => walk(h.projectsDir).filter((p) => /meta\/resource-[^/]*\.meta\.json$/.test(p)).map((p) => ({ file: path.basename(p), json: JSON.parse(readFileSync(p, "utf8")) }));
export const sidecarByName = (h, name) => sidecars(h).find((s) => s.json.name === name || s.json.title === name);
export const projectJson = (h) => { const p = walk(h.projectsDir).find((x) => /\/project\.json$/.test(x)); return p ? JSON.parse(readFileSync(p, "utf8")) : null; };
export const projectDir = (h) => { const p = walk(h.projectsDir).find((x) => /\/project\.json$/.test(x)); return p ? path.dirname(p) : null; };
