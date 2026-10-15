// Shared helpers for the Task 4 runs (web build, Playwright). Builds on task3-lib.mjs.
export * from "./task3-lib.mjs";
import { bodyText, say, J } from "./task3-lib.mjs";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
export const step = async (id, fn) => { try { await fn(); } catch (e) { say(`${id} STEP ERROR ${String(e.message).split("\n").slice(0, 3).join(" | ")}`); } };
export const walk = (d, o = []) => { if (!existsSync(d)) return o; for (const e of readdirSync(d)) { const p = path.join(d, e); statSync(p).isDirectory() ? walk(p, o) : o.push(p); } return o; };
export async function createDoc(page, title, viaNode = "Workspace") {
  await page.click(`button[aria-label="${viaNode} options"]`);
  await page.click(".resource-context-menu-item:has-text('Create')");
  await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill(title);
  await page.locator("[role=dialog] button:has-text('Create'), dialog button:has-text('Create')").last().click();
  await page.waitForTimeout(2500);
}
export async function openDoc(page, title) {
  if (!(await page.locator(`text=${title}`).count())) { await expandAll(page); }
  await page.click(`text=${title} >> nth=0`);
  await page.waitForTimeout(1500);
}
export const pm = (page) => page.locator(".ProseMirror").first();
export const html = (page) => page.evaluate(() => document.querySelector(".ProseMirror").innerHTML);
export const footer = async (page) => (await bodyText(page)).split("\n").filter((l) => /^Words:|^Node:|^Today|saved|incomplete|unavailable/i.test(l));
/** Wait until the footer shows a settled "All changes saved" within 3s of now and return the footer lines. */
export async function waitSaved(page, ms = 4500) {
  await page.waitForTimeout(ms);
  for (let i = 0; i < 30; i++) {
    const t = await bodyText(page);
    if (/All changes saved · (just now|[0-3]s ago)/.test(t)) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(600);
  return footer(page);
}
export async function newProjectWithDoc(page, h, projName, docTitle, typeStart = "Blank") {
  await createProject(page, h, projName, typeStart);
  await createDoc(page, docTitle);
  await openDoc(page, docTitle);
}
import { createProject, expandAll } from "./task3-lib.mjs";
export { createProject, expandAll };
export const projectDirs = (h) => readdirSync(h.projectsDir).map((d) => path.join(h.projectsDir, d));
export const logFiles = (h) => walk(h.projectsDir).filter((p) => /writing-log\/.*\.json$/.test(p));
export const readLog = (h) => logFiles(h).map((p) => ({ file: path.basename(p), json: JSON.parse(readFileSync(p, "utf8")) }));
export async function reopenDoc(page, proj, doc) {
  await page.reload(); await page.waitForTimeout(2000);
  await page.click(`button[aria-label="Open ${proj}"]`); await page.waitForTimeout(2000);
  await openDoc(page, doc);
}
export const plainHtml = async (page) => (await html(page)).replace(/<p[^>]*>/g, "<p>");
