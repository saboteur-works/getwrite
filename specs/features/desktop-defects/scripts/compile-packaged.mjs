#!/usr/bin/env node
/**
 * Feature 88 Task 12 (D-40, FR-16, FR-23): manual Compile in the UNPACKED
 * (electron-builder --dir) build. Usage:
 *   node compile-packaged.mjs <app-binary> <launch-cwd> [<label>]
 * Same method as compile-dev.mjs (require-free will-download hook plus
 * session.setDownloadPath(<throwaway>) before Compile) and the same launch and
 * safety method as docx-import-packaged.mjs (throwaway productName/name build,
 * --user-data-dir, seeded workspace.json). The first action after launch asserts
 * userData and logs are the throwaway ones and not under a protected folder.
 * Run OUTSIDE the command sandbox. Never lists ~/Downloads.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  Recorder, REPO, assertThrowaway, cleanupRun, createRun, errLine, listeners, preflight,
  repoProjectsStatus, say, sleep,
} from "./lib/safety.mjs";
import { execFileSync } from "node:child_process";

const [binary, launchCwd, label = "run"] = process.argv.slice(2);
if (!binary || !launchCwd) { console.error("usage: <app-binary> <launch-cwd> [label]"); process.exit(2); }
if (!existsSync(binary) || !binary.startsWith("/tmp/getwrite-f88/build/")) { console.error("binary must be under /tmp/getwrite-f88/build/"); process.exit(2); }
const APP_PORT = 7340;
const ownerDirs = [
  path.join(homedir(), "Library", "Application Support", "getwrite-electron"),
  path.join(homedir(), "Library", "Logs", "getwrite-electron"),
  path.join(homedir(), "Library", "Application Support", "GetWrite"),
  path.join(homedir(), "Library", "Logs", "GetWrite"),
  path.join(homedir(), "Documents", "GetWrite"),
  path.join(REPO, "projects"),
];
const J = (x) => JSON.stringify(x);
const strip = (s, run) => String(s).split(run.dir).join("<run-dir>");
const lsofRaw = () => {
  try { return execFileSync("lsof", ["-nP", "-iTCP:7340", "-iTCP:3000", "-iTCP:6006", "-sTCP:LISTEN"], { encoding: "utf8" }); } catch (e) { return `(empty output, exit ${e.status})`; }
};
say(`launch cwd requested: ${launchCwd}`);
say(`lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN BEFORE: ${J(lsofRaw())}`);
say(`ports before: ${preflight([APP_PORT])}`);
say(`git status --short projects/ BEFORE: ${repoProjectsStatus()}`);
const run = createRun(`pkgcompile-${label}`);
const userData = path.join(run.dir, "userdata");
const projectsDir = path.join(run.dir, "workspace");
const downloads = path.join(run.dir, "downloads");
for (const d of [userData, projectsDir, downloads]) { mkdirSync(d); assertThrowaway(d); }
writeFileSync(path.join(userData, "workspace.json"), JSON.stringify({ projectsDir }));
const downloadsReal = assertThrowaway(downloads);
const logDir = path.join(homedir(), "Library", "Logs", "GwF88Throwaway");
const fake = run.dir; // projects live in projectsDir; "fake" only used below for listing

const rec = new Recorder();
let app;
let code = 0;
const consoleLines = [];
const step = async (id, fn) => { try { await fn(); } catch (e) { say(`${id} STEP ERROR ${errLine(e)}`); code = 1; } };
try {
  const { _electron } = createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
  const env = { ...process.env };
  for (const k of ["DATABASE_URL", "BETTER_AUTH_SECRET", "GETWRITE_ENABLE_DEV_IDENTITY", "GETWRITE_BIND", "HOSTNAME", "GETWRITE_SHARING", "GETWRITE_WINDOW_SECRET", "GETWRITE_SHARING_DIR", "GETWRITE_PROJECTS_DIR", "GETWRITE_PROJECT_TYPES_DIR", "ELECTRON_RUN_AS_NODE", "PORT"]) delete env[k];
  app = await _electron.launch({ executablePath: binary, args: [`--user-data-dir=${userData}`], cwd: launchCwd, env, timeout: 120000 });
  rec.add(app.process().pid, "electron-main");
  const info = await app.evaluate(({ app: a }) => ({ ud: a.getPath("userData"), logs: a.getPath("logs"), packaged: a.isPackaged, name: a.getName(), cwd: process.cwd(), version: process.versions.electron }));
  say(`app.getPath("userData") = ${strip(info.ud, run)}; app.getPath("logs") = ${strip(info.logs.replace(homedir(), "~"), run)}; isPackaged=${info.packaged}; electron ${info.version}`);
  const under = (p) => ownerDirs.some((o) => p === o || p.startsWith(o + path.sep));
  say(`app.getName()=${info.name}; app process.cwd() = ${strip(info.cwd, run)}`);
  const bad = under(info.ud) || under(info.logs) || realpathSync(info.ud) !== realpathSync(userData) || info.logs !== logDir;
  say(`userData is the throwaway folder: ${realpathSync(info.ud) === realpathSync(userData)}; logs is the expected throwaway folder: ${info.logs === logDir}; under a protected folder: ${under(info.ud) || under(info.logs)}`);
  if (bad) throw new Error("path assertion failed; stopping before any use");
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
  for (let i = 0; i < 90; i++) {
    rec.walk(process.pid);
    if (page.url().startsWith(`http://localhost:${APP_PORT}`) && (await page.evaluate(() => document.readyState)) === "complete") break;
    await sleep(1000);
  }
  rec.walk(process.pid);
  say(`pids started (electron main + descendants): ${rec.describe()}`);
  say(`lsof 7340 while running: ${listeners(APP_PORT).join(",") || "none"}`);
  await page.waitForTimeout(2000);

  // ---- throwaway project with two text resources (UI, inside the fake root's projects/)
  const pm = page.locator(".ProseMirror").first();
  const expandAll = async () => { for (let i = 0; i < 40; i++) { const b = await page.$('button[aria-label^="Expand "]'); if (!b) break; await b.click(); await page.waitForTimeout(150); } };
  const treeClick = async (name) => {
    const ti = page.locator(`[role=treeitem][aria-label="${name}"]`);
    if (!(await ti.count())) await expandAll();
    if (await ti.count()) await ti.first().click(); else await page.click(`text=${name} >> nth=0`);
    await page.waitForTimeout(2000);
  };
  const createNode = async (title) => {
    await page.click('button[aria-label="Workspace options"]');
    await page.click(".resource-context-menu-item:has-text('Create')");
    await page.locator("[role=dialog] input[type=text], dialog input[type=text]").first().fill(title);
    await page.locator("[role=dialog] button:has-text('Create'), dialog button:has-text('Create')").last().click();
    await page.waitForTimeout(2500);
  };
  const typeInto = async (title, text) => { await treeClick(title); await pm.click(); await page.keyboard.insertText(text); await page.waitForTimeout(4500); };
  await step("project", async () => {
    await page.click("button:has-text('START A NEW PROJECT')");
    await page.waitForTimeout(500);
    await page.fill('input:not([aria-label="Filter project types"])', "F88 Compile");
    const opt = await page.$$eval("select option", (os) => os.find((o) => o.textContent.startsWith("Blank"))?.textContent);
    await page.selectOption("select", { label: opt });
    await page.click("button:has-text('CREATE'):not(:has-text('FIRST'))");
    await page.waitForTimeout(2500);
    await createNode("Doc B"); await createNode("Doc A");
    await typeInto("Doc B", "Bee text."); await typeInto("Doc A", "Ay text.");
  });
  const projs = readdirSync(projectsDir);
  const textRes = projs.flatMap((p) => { const r = path.join(projectsDir, p, "resources"); return existsSync(r) ? readdirSync(r) : []; });
  say(`throwaway workspace entries: ${projs.length}; text resource folders on disk: ${textRes.length}`);

  // ---- hook + download path, BEFORE Compile
  const hookResult = await app.evaluate(({ BrowserWindow, session, dialog }, { dir, form }) => {
    const out = { form, typeofRequire: typeof require, errors: [] };
    globalThis.__uncaught = [];
    process.on("uncaughtException", (err) => { globalThis.__uncaught.push(String(err && err.message).slice(0, 200)); });
    globalThis.__dl = [];
    globalThis.__dialogCalls = [];
    const wins = BrowserWindow.getAllWindows();
    out.windows = wins.length;
    out.sessionIsDefault = wins.length > 0 && wins[0].webContents.session === session.defaultSession;
    out.hasSetDownloadPath = typeof wins[0].webContents.session.setDownloadPath;
    try { wins[0].webContents.session.setDownloadPath(dir); out.downloadPathSet = true; } catch (e) { out.downloadPathSet = false; out.errors.push("setDownloadPath: " + e.message); }
    let hooked = 0;
    try {
      for (const w of wins) {
        w.webContents.session.on("will-download", (_e, item) => {
          const rec = { name: item.getFilename(), mime: item.getMimeType(), total: item.getTotalBytes(), url: String(item.getURL()).slice(0, 12), savePathBefore: item.getSavePath(), state: "started" };
          // form "old" is the task8-desk.mjs shape: `require` inside the handler, before anything is recorded.
          const target = form === "old" ? require("node:path").join(dir, item.getFilename()) : dir + "/" + item.getFilename();
          globalThis.__dl.push(rec);
          item.setSavePath(target);
          rec.savePathAfter = item.getSavePath();
          item.on("done", (_ev, state) => { rec.state = state; });
        });
        hooked += 1;
      }
    } catch (e) { out.errors.push("hook: " + e.message); }
    out.hooked = hooked;
    for (const fn of ["showSaveDialog", "showSaveDialogSync"]) {
      const orig = dialog[fn];
      dialog[fn] = (...a) => { globalThis.__dialogCalls.push(fn); return fn === "showSaveDialog" ? Promise.resolve({ canceled: true }) : undefined; };
      void orig;
    }
    return out;
  }, { dir: downloadsReal, form: process.env.HOOK_FORM === "old" ? "old" : "new" });
  say(`hook install (before Compile): ${J(hookResult)}`);
  say(`download path set to the asserted throwaway folder (<run-dir>/downloads) before Compile: ${hookResult.downloadPathSet === true}`);

  // ---- Compile
  const c0 = consoleLines.length;
  await step("compile", async () => {
    await page.click('button[aria-label="Open project menu"]');
    await page.locator("text=Compile Project").first().click();
    await page.waitForTimeout(900);
    const d = await page.evaluate(() => { const x = document.querySelector("[role=dialog], dialog"); return x ? x.innerText.split("\n").filter(Boolean) : null; });
    say(`Compile Project dialog text: ${J(d)}`);
    await page.click("button:has-text('SELECT ALL')");
    await page.waitForTimeout(300);
    await page.locator("[role=dialog] button:has-text('COMPILE ('), dialog button:has-text('COMPILE (')").first().click();
    await page.waitForTimeout(4000);
  });
  await sleep(6000);
  const after = await app.evaluate(({ BrowserWindow }) => ({ uncaught: globalThis.__uncaught, dl: globalThis.__dl, dialogCalls: globalThis.__dialogCalls, windows: BrowserWindow.getAllWindows().length }));
  say(`will-download events fired: ${after.dl.length}; records: ${J(after.dl.map((d) => ({ ...d, savePathBefore: strip(d.savePathBefore, run), savePathAfter: strip(d.savePathAfter || "", run) })))}`);
  say(`uncaught exceptions recorded in the main process: ${J(after.uncaught)}`);
  say(`save-dialog calls (showSaveDialog/Sync, wrapped to record and cancel): ${J(after.dialogCalls)}; BrowserWindow count after: ${after.windows}`);
  const files = readdirSync(downloads).map((f) => ({ name: f, bytes: statSync(path.join(downloads, f)).size }));
  say(`files in the throwaway download folder: ${J(files)}`);
  for (const f of files) say(`  content of ${f.name} (first 300 chars): ${J(readFileSync(path.join(downloads, f.name), "utf8").slice(0, 300))}`);
  const dlgAfter = await page.evaluate(() => { const x = document.querySelector("[role=dialog], dialog"); return x ? x.innerText.split("\n").filter(Boolean) : null; });
  say(`page dialog after Compile: ${J(dlgAfter)}`);
  say(`page text lines mentioning compile/download/saved/export: ${J((await page.evaluate(() => document.body.innerText)).split("\n").filter((l) => /compil|download|saved to|exported/i.test(l)).slice(0, 8))}`);
  say(`page console during/after Compile (${consoleLines.length - c0}): ${J(consoleLines.slice(c0).map((l) => strip(l, run)))}`);
  const logFile = path.join(logDir, "getwrite.log");
  const lines = existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").filter(Boolean) : [];
  say(`app log lines matching compile|download|error|fail: ${J(lines.filter((l) => /compil|download|error|fail/i.test(l)).map((l) => strip(l, run).slice(0, 300)).slice(-8))}`);
  say(`all page console lines (${consoleLines.length}): ${J(consoleLines.map((l) => strip(l, run)))}`);
  rec.walk(process.pid);
} catch (e) {
  say(`script error: ${errLine(e)}`);
  code = 1;
} finally {
  if (app) {
    rec.walk(process.pid);
    const all = rec.describe();
    await Promise.race([app.close(), sleep(20000)]).catch((e) => say(`app.close: ${errLine(e)}`));
    await sleep(2000);
    const o = await rec.stop();
    say(`stop: recorded ${all}; ${o.stages.join("; ") || "all exited after app.close"}`);
    say(`lsof 7340 after stop: ${listeners(APP_PORT).join(",") || "none"}`);
  }
  rmSync(logDir, { recursive: true, force: true });
  say(`throwaway log folder removed: ${!existsSync(logDir)}`);
  say(`throwaway run folder removed: ${cleanupRun(run).removed}`);
  say(`lsof AFTER: ${J(lsofRaw())}`);
  say(`git status --short projects/ AFTER: ${repoProjectsStatus()}`);
}
process.exit(code);
