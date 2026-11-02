// FR-39 web and desktop parts: time the filtered total and daily reads over HTTP on generated projects, and measure
// typing and autosave on a large project with and without a filter. Usage: node measure-http.mjs <web|desktop> <app-path>.
// Throwaway folders only. Run OUTSIDE the sandbox.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { REPO, Recorder, cleanupRun, createRun, errLine, listeners, preflight, protectedPortsState, repoProjectsStatus, say, sleep } from "../../user-handbook/scripts/lib/safety.mjs";
import { startWeb, stopWeb } from "../../user-handbook/scripts/web-standalone.mjs";

const req = createRequire(path.join(REPO, "frontend/package.json"));
const { _electron, chromium } = req("@playwright/test");
const MODE = process.argv[2];
const SIZES = [500, 5000, 20000];
const UI_SIZE = 5000;
const FILTER = { op: "eq", field: "status", value: "Draft" };
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const rssMb = (pid) => Math.round(Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim()) / 1024);
const run = createRun(`measure-${MODE}`);
let page, projectsDir, serverPid, cleanup;
try {
  if (MODE === "web") {
    const h = await startWeb(run, {});
    projectsDir = h.projectsDir; serverPid = h.pid;
    const browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(h.baseUrl + "/");
    cleanup = async () => { await browser.close(); h.rec.walk(h.pid); await stopWeb(h); };
  } else {
    say(`ports before: ${preflight([7340])}`);
    projectsDir = path.join(run.dir, "projects"); mkdirSync(projectsDir);
    const userData = path.join(run.dir, "userdata"); mkdirSync(userData);
    writeFileSync(path.join(userData, "workspace.json"), JSON.stringify({ projectsDir }));
    const app = await _electron.launch({ executablePath: path.join(path.resolve(process.argv[3]), "Contents/MacOS/GetWrite"), args: [`--user-data-dir=${userData}`], timeout: 60000 });
    const rec = new Recorder(); rec.add(app.process().pid, "main");
    const info = await app.evaluate(({ app: a }) => a.getPath("userData"));
    if (realpathSync(info) !== realpathSync(userData)) throw new Error("userData is not the throwaway folder");
    page = await app.firstWindow();
    for (let i = 0; i < 60; i++) { if (page.url().startsWith("http://localhost:7340") && (await page.evaluate(() => document.readyState)) === "complete") break; await sleep(500); }
    rec.walk(process.pid);
    serverPid = listeners(7340)[0];
    serverPid = typeof serverPid === "string" ? Number(serverPid.match(/\d+/)[0]) : serverPid;
    cleanup = async () => { await Promise.race([app.close(), sleep(15000)]).catch(() => {}); await sleep(800); rec.walk(process.pid); await rec.stop(); };
  }
  await page.waitForTimeout(1500);
  const createProject = async (name) => {
    await page.click("button:has-text('START A NEW PROJECT')"); await page.waitForTimeout(500);
    await page.fill('input:not([aria-label="Filter project types"])', name);
    const blank = await page.$$eval("select option", (os) => os.find((o) => o.textContent.startsWith("Blank"))?.textContent);
    await page.selectOption("select", { label: blank });
    await page.click("button:has-text('CREATE'):not(:has-text('FIRST'))"); await page.waitForTimeout(2500);
    await page.click('button[aria-label="Workspace options"]');
    await page.click(".resource-context-menu-item:has-text('Create')");
    await page.locator("[role=dialog] input[type=text]").first().fill("Doc");
    await page.locator("[role=dialog] button:has-text('Create')").last().click(); await page.waitForTimeout(2000);
    await page.locator('[role=treeitem]:has-text("Doc")').first().click(); await page.waitForTimeout(1200);
    await page.locator(".ProseMirror").first().click(); await page.keyboard.type("one two three four five"); await page.waitForTimeout(3500);
    await page.click('button[aria-label="Open project settings menu"]'); await page.click("[role=menuitem]:has-text('Close Project')"); await page.waitForTimeout(1500);
  };
  const dirsBefore = new Set();
  const projects = [];
  for (const n of SIZES) {
    await createProject(`P${n}`);
    const dir = readdirSync(projectsDir).find((d) => !dirsBefore.has(d));
    dirsBefore.add(dir);
    projects.push({ n, dir, root: path.join(projectsDir, dir) });
  }
  // Generate documents by copying the real one, using the same layout the app wrote.
  for (const p of projects) {
    const resources = path.join(p.root, "resources");
    const [srcId] = readdirSync(resources);
    const metaDir = path.join(p.root, "meta");
    const srcMeta = readFileSync(path.join(metaDir, `resource-${srcId}.meta.json`), "utf8");
    const meta = JSON.parse(srcMeta);
    const today = new Date().toISOString().slice(0, 10);
    const entries = [];
    for (let i = 1; i < p.n; i++) {
      const id = randomUUID();
      cpSync(path.join(resources, srcId), path.join(resources, id), { recursive: true });
      writeFileSync(path.join(metaDir, `resource-${id}.meta.json`), JSON.stringify({ ...meta, id, name: `Doc ${i}`, slug: `doc-${i}`, orderIndex: i, userMetadata: { ...(meta.userMetadata ?? {}), status: i % 2 ? "Draft" : "Published" } }));
      if (i <= 200) entries.push({ added: 1, deleted: 0, net: 1, timestamp: new Date().toISOString(), documentId: id });
    }
    const logFile = path.join(metaDir, "writing-log", `${today}.json`);
    const log = JSON.parse(readFileSync(logFile, "utf8"));
    writeFileSync(logFile, JSON.stringify({ entries: [...log.entries, ...entries] }));
  }
  const setFilter = (p, on) => { const f = path.join(p.root, "project.json"); const j = JSON.parse(readFileSync(f, "utf8")); if (on) j.config.goalFilter = FILTER; else delete j.config.goalFilter; writeFileSync(f, JSON.stringify(j, null, 2)); };
  const timeRead = (url) => page.evaluate(async (u) => { const t = performance.now(); const r = await fetch(u); const b = await r.json(); return { ms: performance.now() - t, status: r.status, body: b }; }, url);
  const from = new Date(); from.setHours(0, 0, 0, 0); const to = new Date(from.getTime() + 864e5);
  say(`mode=${MODE}; server pid ${serverPid}; RSS before reads ${rssMb(serverPid)} MB; 7 reads each; first read reported apart`);
  for (const p of projects) for (const on of [true, false]) {
    setFilter(p, on);
    for (const [label, url] of [["total", `/api/project/goal-filtered-total?projectId=${p.dir}`], ["daily", `/api/project/writing-log?projectId=${p.dir}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`]]) {
      const times = []; let last;
      for (let i = 0; i < 7; i++) { last = await timeRead(url); times.push(last.ms); }
      say(`${p.n} docs, filter ${on ? "on" : "off"}, ${label}: first ${Math.round(times[0])} ms; median ${Math.round(median(times))} ms; max ${Math.round(Math.max(...times))} ms; HTTP ${last.status}; ${JSON.stringify(last.body).slice(0, 110)}; server RSS ${rssMb(serverPid)} MB`);
    }
  }
  // Typing and autosave on the UI-size project, with and without a filter.
  const ui = projects.find((p) => p.n === UI_SIZE);
  for (const on of [false, true]) {
    setFilter(ui, on);
    await page.reload(); await page.waitForTimeout(3000);
    const t0 = Date.now();
    await page.locator(`button[aria-label="Open P${UI_SIZE}"]`).click({ timeout: 120000 });
    await page.waitForSelector('[role=treeitem]', { timeout: 120000 }); 
    say(`typing, filter ${on ? "on" : "off"}: project open took ${Date.now() - t0} ms`);
    for (let i = 0; i < 10; i++) { const b = await page.$('button[aria-label^="Expand "]'); if (!b) break; await b.click(); await page.waitForTimeout(200); }
    await page.locator('[role=treeitem]:has-text("Doc")').first().click({ timeout: 60000 }); await page.waitForTimeout(3000);
    const saves = [];
    const started = new Map();
    const onReq = (r) => { if (r.method() === "PATCH" && r.url().includes("/api/resource/revision")) started.set(r, Date.now()); };
    const onRes = (r) => { const q = r.request(); if (started.has(q)) saves.push(Date.now() - started.get(q)); };
    page.on("request", onReq); page.on("response", onRes);
    await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ entryTypes: ["longtask"] }); window.__keys = []; document.addEventListener("keydown", (e) => { const s = performance.now(); requestAnimationFrame(() => window.__keys.push(performance.now() - s)); }, true); });
    await page.locator(".ProseMirror").first().click();
    for (let round = 0; round < 3; round++) { await page.keyboard.type(" some words typed here now to save", { delay: 60 }); await page.waitForTimeout(5000); }
    const m = await page.evaluate(() => ({ lt: window.__lt, keys: window.__keys }));
    page.off("request", onReq); page.off("response", onRes);
    say(`typing, filter ${on ? "on" : "off"}: keydown to next frame median ${Math.round(median(m.keys))} ms, max ${Math.round(Math.max(...m.keys))} ms over ${m.keys.length} keys; long tasks ${m.lt.length}, longest ${Math.round(Math.max(0, ...m.lt))} ms; saves ${saves.length}, durations ${JSON.stringify(saves)} ms; footer ${JSON.stringify((await page.evaluate(() => document.body.innerText)).split("\n").filter((l) => /^Today|Counting/.test(l.trim())).slice(0, 3))}`);
  }
} catch (e) {
  say(`ERROR ${errLine(e)}`);
} finally {
  await cleanup?.().catch((e) => say(`cleanup ${errLine(e)}`));
  say(`removed run folder: ${cleanupRun(run).removed}; ports after: ${protectedPortsState()}; projects: ${repoProjectsStatus()}`);
}
process.exit(0);
