// Shared helpers for the Task 3 web runs (Playwright against the built standalone server).
import { createRequire } from "node:module";
import path from "node:path";
import { REPO, createRun, cleanupRun, say, protectedPortsState, repoProjectsStatus, errLine } from "./lib/safety.mjs";
import { startWeb, stopWeb } from "./web-standalone.mjs";
export const { chromium } = createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
export { say };
export const J = (x) => JSON.stringify(x);
export const bodyText = (page) => page.evaluate(() => document.body.innerText);
export async function newLines(page, fn) {
  const a = new Set((await bodyText(page)).split("\n"));
  await fn();
  await page.waitForTimeout(700);
  return (await bodyText(page)).split("\n").filter((l) => l.trim() && !a.has(l));
}
export async function withWeb(label, opts, body) {
  const run = createRun(label);
  say(`ports before: ${protectedPortsState()}`);
  say(`git status --short projects/ BEFORE: ${repoProjectsStatus() || "(empty)"}`);
  let h, browser;
  try {
    h = await startWeb(run, opts);
    say(`server pid ${h.pid} port ${h.port} (throwaway projects dir; templates ${opts.copyTemplates ? "throwaway copy" : "repo read-only"})`);
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    try { await body({ h, page, browser }); } catch (e) {
      say("SCRIPT ERROR " + (e.stack||String(e)).split("\n").slice(0,6).join(" | "));
      await page.screenshot({ path: `/tmp/getwrite-handbook/logs/${label}-error.png` }).catch(() => {});
      say("PAGE AT ERROR " + J((await bodyText(page).catch(() => "")).slice(0, 600)));
    }
  } catch (e) {
    say("SCRIPT ERROR(outer) " + errLine(e));
  } finally {
    if (browser) await browser.close();
    if (h) {
      h.rec.walk(h.pid);
      const o = await stopWeb(h);
      say(`stop: recorded ${o.stop.recorded}; listener after: ${o.listenersOnPort}`);
    }
    say(`removed: ${cleanupRun(run).removed}; ports after: ${protectedPortsState()}; projects: ${repoProjectsStatus() || "(empty)"}`);
  }
}
export async function createProject(page, h, name, typeLabelStart) {
  await page.goto(h.baseUrl + "/");
  await page.waitForTimeout(1500);
  await page.click("button:has-text('START A NEW PROJECT')");
  await page.waitForTimeout(500);
  await page.fill('input:not([aria-label="Filter project types"])', name);
  const opt = await page.$$eval("select option", (os, s) => os.find((o) => o.textContent.startsWith(s))?.textContent, typeLabelStart);
  await page.selectOption("select", { label: opt });
  await page.click("button:has-text('CREATE'):not(:has-text('FIRST'))");
  await page.waitForTimeout(2500);
}
export async function expandAll(page) {
  for (let i = 0; i < 40; i++) {
    const b = await page.$('button[aria-label^="Expand "]');
    if (!b) break;
    await b.click();
    await page.waitForTimeout(150);
  }
}
export async function treeText(page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find((e) => /^RESOURCES/i.test((e.innerText || "").trim()) && e.querySelector('button[aria-label^="Collapse "],button[aria-label^="Expand "]'));
    return el ? el.innerText : "";
  });
}
export async function closeProject(page) {
  await page.click('button[aria-label="Open project settings menu"]');
  await page.click("text=Close Project");
  await page.waitForTimeout(1500);
}
// Tree rows with depth (x offset of the row's label) and folder flag (has an Expand/Collapse button).
export async function treeRows(page) {
  return page.evaluate(() => {
    const out = [];
    const panel = [...document.querySelectorAll("*")].find((e) => /^RESOURCES/i.test((e.innerText || "").trim()) && e.querySelector('button[aria-label^="Collapse "],button[aria-label^="Expand "]') && e.getBoundingClientRect().width < 400);
    if (!panel) return out;
    const labelEls = [...panel.querySelectorAll("*")].filter((e) => e.children.length === 0 && (e.textContent || "").trim() && !/^(RESOURCES|SMART FOLDERS)$/i.test(e.textContent.trim()) && !e.closest("button[aria-label^='Collapse '], button[aria-label^='Expand ']") || false);
    for (const e of [...panel.querySelectorAll("[class*=row], [role=treeitem], li")]) {
      void e;
    }
    // generic: any element whose own text is a node name, found via the options button's aria-label
    const opts = [...panel.querySelectorAll('button[aria-label$=" options"]')];
    for (const b of opts) {
      const name = b.getAttribute("aria-label").replace(/ options$/, "");
      const row = b.closest("div");
      const exp = row.parentElement && row.parentElement.querySelector(`button[aria-label="Expand ${name}"], button[aria-label="Collapse ${name}"]`);
      const lbl = [...(row.parentElement || row).querySelectorAll("*")].find((e) => e.children.length === 0 && (e.textContent || "").trim() === name);
      out.push({ name, depth: Math.round(((lbl || b).getBoundingClientRect().left)), folder: !!exp });
    }
    void labelEls;
    return out;
  });
}
// Indented outline from treeRows (folder parent = preceding folder 14px left; resource parent = preceding folder 6px right of the resource label).
export function outline(rows) {
  const lines = [];
  const stack = [];
  for (const r of rows) {
    let parentX = r.folder ? r.depth - 14 : r.depth + 6;
    while (stack.length && stack[stack.length - 1].depth > parentX) stack.pop();
    const lvl = stack.length;
    lines.push(`${"  ".repeat(lvl)}${r.folder ? "[folder] " : "[resource] "}${r.name}`);
    if (r.folder) stack.push({ depth: r.depth });
  }
  return lines;
}
