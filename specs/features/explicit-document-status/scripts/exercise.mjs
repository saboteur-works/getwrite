// Runs Feature 99 in a built app as a writer would, on a throwaway projects folder.
// Usage: node exercise.mjs <web|desktop> <screenshot-dir>. Run OUTSIDE the sandbox, after the frontend build
// (and, for desktop, the electron build). Web uses the built standalone server; desktop the unpackaged app.
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { REPO, cleanupRun, createRun, say } from "../../user-handbook/scripts/lib/safety.mjs";

const MODE = process.argv[2];
const SHOTS = process.argv[3];
mkdirSync(SHOTS, { recursive: true });
const J = (x) => JSON.stringify(x);
const run = createRun(`f99-${MODE}`);
let page, browser, web, desk, projectsDir;
if (MODE === "web") {
  const { startWeb } = await import("../../user-handbook/scripts/web-standalone.mjs");
  const { chromium } = createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
  web = await startWeb(run);
  projectsDir = web.projectsDir;
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.goto(web.baseUrl);
} else {
  const { startDesktop } = await import("../../user-handbook/scripts/desktop-dev.mjs");
  desk = await startDesktop(run);
  projectsDir = desk.projectsDir;
  page = desk.page;
  say(`desktop packaged=${desk.info.packaged} url=${page.url()}`);
}
const wait = (ms) => page.waitForTimeout(ms);
const dlg = () => page.locator("[role=dialog]").first();
const lines = async () => (await page.evaluate(() => document.body.innerText)).split("\n").map((l) => l.trim()).filter(Boolean);
const expandAll = async () => { for (let i = 0; i < 10; i++) { const b = await page.$('button[aria-label^="Expand "]'); if (!b) break; await b.click(); await wait(150); } };
const open = async (t) => { await expandAll(); await page.locator(`[role=treeitem]:has-text("${t}")`).first().click(); await wait(1500); };
const create = async (t) => { await page.click('button[aria-label="Workspace options"]'); await page.click(".resource-context-menu-item:has-text('Create')"); await page.locator("[role=dialog] input[type=text]").first().fill(t); await page.locator("[role=dialog] button:has-text('Create')").last().click(); await wait(2500); };
const settings = async (tab) => { await page.click('button[aria-label="Open project settings menu"]'); await page.click("text=Project Settings"); await wait(800); await dlg().locator(`[role=tab]:has-text("${tab}")`).click(); await wait(500); };
const closeDlg = async () => { await page.keyboard.press("Escape"); await wait(500); };
const statusSel = () => page.locator('select[aria-label="status"]').first();
const sidebar = async () => {
  const s = statusSel();
  const opts = await s.locator("option").allInnerTexts();
  const shown = await s.evaluate((el) => el.options[el.selectedIndex]?.text ?? null);
  const hint = await page.locator("#" + ((await s.getAttribute("aria-describedby")) || "none")).allInnerTexts().catch(() => []);
  return `shown=${J(shown)} options=${J(opts)} hint=${J(hint)}`;
};
const projectDir = () => path.join(projectsDir, readdirSync(projectsDir)[0]);
const sidecarStatus = (title) => {
  const dir = projectDir();
  const meta = readdirSync(path.join(dir, "meta")).filter((f) => f.startsWith("resource-"));
  for (const f of meta) {
    const s = JSON.parse(readFileSync(path.join(dir, "meta", f), "utf8"));
    if (s.name === title || s.title === title) return J(s.userMetadata ?? null);
  }
  return `not found among ${meta.length} sidecars`;
};
const configStatuses = () => J(JSON.parse(readFileSync(path.join(projectDir(), "project.json"), "utf8")).config?.statuses ?? null);
const addStatus = async (label) => {
  await dlg().locator("#status-new").fill(label);
  await dlg().locator("#status-new").locator("xpath=following::button[normalize-space()='Add'][1]").click();
  await wait(900);
};
const statusSection = async () => {
  const h = dlg().locator("h2:has-text('Statuses')");
  return (await h.locator("xpath=..").innerText()).split("\n").map((l) => l.trim()).filter(Boolean);
};
let code = 0;
try {
  await wait(1500);
  await page.click("button:has-text('START A NEW PROJECT')"); await wait(500);
  await page.fill('input:not([aria-label="Filter project types"])', "Status Check");
  const blank = await page.$$eval("select option", (os) => os.find((o) => o.textContent.startsWith("Blank"))?.textContent);
  await page.selectOption("select", { label: blank });
  await page.click("button:has-text('CREATE'):not(:has-text('FIRST'))"); await wait(2500);
  await create("Alpha"); await create("Beta");

  say("== 1. Blank project, no statuses");
  await open("Alpha");
  say(`sidebar: ${await sidebar()}`);
  say(`Alpha stored userMetadata: ${sidecarStatus("Alpha")}; config.statuses=${configStatuses()}`);
  await page.screenshot({ path: path.join(SHOTS, `${MODE}-1-blank-sidebar.png`) });
  await page.locator('button[aria-label="New smart folder"]').first().click(); await wait(1200);
  const rollup = (await lines()).filter((l) => /No statuses are configured/.test(l));
  say(`Data view By status message: ${J(rollup)}`);
  await page.getByRole("button", { name: /add group/i }).first().click(); await wait(400);
  await page.locator("button[aria-label^='Select a field']").first().click(); await wait(300);
  await page.fill('[aria-label="Search fields"]', "status"); await wait(300);
  const fieldOpts = await page.locator('[aria-label="Select a field"] [role=option]').allInnerTexts();
  say(`field picker "status": ${J(fieldOpts.map((t) => t.replace(/\s+/g, " ")))}`);
  await page.locator('[aria-label="Select a field"] [role=option]').filter({ hasText: /^Status\s*builtin/i }).first().click(); await wait(400);
  say(`Status chip value options (no statuses): ${J(await page.locator('[aria-label="Value"]').first().locator("option").allInnerTexts())}`);

  say("== 2. Statuses editor");
  await settings("Metadata");
  await addStatus("Outline"); await addStatus("Draft");
  say(`section after adding Outline, Draft: ${J(await statusSection())}; stored=${configStatuses()}`);
  await addStatus("draft ");
  say(`duplicate "draft ": error=${J(await dlg().locator("#status-new-error").allInnerTexts())}; stored=${configStatuses()}`);
  await addStatus("   ");
  say(`blank: error=${J(await dlg().locator("#status-new-error").allInnerTexts())}; stored=${configStatuses()}`);
  await dlg().locator('button[aria-label="Move Draft up"]').click(); await wait(900);
  say(`after Move Draft up: stored=${configStatuses()}`);
  await page.screenshot({ path: path.join(SHOTS, `${MODE}-2-editor.png`) });
  await closeDlg();

  say("== 3. Sidebar after editing, no reload");
  await open("Alpha");
  say(`Alpha sidebar: ${await sidebar()}`);
  await statusSel().selectOption({ label: "Draft" }); await wait(1500);
  say(`after choosing Draft: ${await sidebar()}; stored=${sidecarStatus("Alpha")}`);
  await statusSel().selectOption({ label: "No status" }); await wait(1500);
  say(`after choosing No status: ${await sidebar()}; stored=${sidecarStatus("Alpha")}`);
  await statusSel().selectOption({ label: "Outline" }); await wait(1500);
  await open("Beta");
  await statusSel().selectOption({ label: "Draft" }); await wait(1500);
  say(`Alpha=${sidecarStatus("Alpha")} Beta=${sidecarStatus("Beta")}`);

  say("== 4. Off-list: remove Draft from the list");
  await settings("Metadata");
  await dlg().locator('button[aria-label="Remove Draft"]').click(); await wait(900);
  say(`stored list=${configStatuses()}; Beta stored=${sidecarStatus("Beta")}`);
  await closeDlg();
  await open("Beta");
  say(`Beta sidebar: ${await sidebar()}`);
  await page.screenshot({ path: path.join(SHOTS, `${MODE}-4-offlist.png`) });
  const dirName = readdirSync(projectsDir)[0];
  for (const value of ["Draft", "Outline"]) {
    const r = await page.evaluate(async ([id, v]) => {
      const res = await fetch("/api/project/query/evaluate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: id, definition: { op: "eq", field: "status", value: v } }) });
      return { s: res.status, b: await res.text() };
    }, [dirName, value]);
    say(`evaluate status=${value}: ${r.s} ${r.b.slice(0, 160)}`);
  }

  say("== 5. Organizer");
  await create("Gamma");
  await page.locator('[role=treeitem]:has-text("Workspace")').first().click(); await wait(1200);
  await page.locator("[role=tab][data-value=organizer]").click(); await wait(1500);
  const cards = async () => page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Open").map((b) => { let n = b; while (n && !/Words:/.test(n.innerText.replace(/Open$/, "")) ) n = n.parentElement; while (n && !/\d+\/\d+\/\d+/.test(n.innerText)) n = n.parentElement; return n ? n.innerText.replace(/\s+/g, " ").trim().slice(0, 80) : "?"; }));
  await page.locator("text=Filters").first().click(); await wait(500);
  say(`cards: ${J(await cards())}`);
  const filter = page.locator('select[aria-label="Filter by status"]');
  say(`filter options: ${J(await filter.locator("option").allInnerTexts())}`);
  for (const label of ["Outline", "No status"]) {
    await filter.selectOption({ label }); await wait(800);
    say(`filter ${label}: ${J(await cards())}`);
  }
  await page.screenshot({ path: path.join(SHOTS, `${MODE}-5-organizer.png`) });
} catch (e) {
  code = 1;
  say(`ERROR ${String(e.message).split("\n").slice(0, 4).join(" | ")}`);
  await page.screenshot({ path: path.join(SHOTS, `${MODE}-error.png`) }).catch(() => {});
} finally {
  if (MODE === "web") {
    const { stopWeb } = await import("../../user-handbook/scripts/web-standalone.mjs");
    await browser.close();
    say(`server stop: ${J((await stopWeb(web)).listenersOnPort)}`);
  } else {
    const { stopDesktop } = await import("../../user-handbook/scripts/desktop-dev.mjs");
    say(`desktop stop: ${J(await stopDesktop(desk))}`);
  }
  cleanupRun(run);
}
process.exit(code);
