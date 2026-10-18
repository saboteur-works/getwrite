#!/usr/bin/env node
/**
 * Feature 88 Task 4: Word import in the development app launched from a working
 * directory other than <root>/electron. Modelled on
 * specs/features/user-handbook/scripts/desktop-dev.mjs (copied fake root,
 * --user-data-dir, throwaway app `name` so `logs` is throwaway). Differences:
 * the launch cwd is the throwaway run directory, not <fake root>/electron; page
 * console and app log are recorded; both Blank and Novel are imported.
 * Run OUTSIDE the command sandbox, from the main checkout. Never touches the
 * owner's userData/logs/workspace folders or the repo's projects/.
 */
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  Recorder, REPO, assertThrowaway, cleanupRun, createRun, errLine, listeners, preflight,
  protectedPortsState, redact, repoProjectsStatus, say, sleep,
} from "./lib/safety.mjs";

const APP_PORT = 7340;
const ELECTRON_BIN = path.join(REPO, "electron/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const ownerDirs = [
  path.join(homedir(), "Library", "Application Support", "getwrite-electron"),
  path.join(homedir(), "Library", "Logs", "getwrite-electron"),
  path.join(homedir(), "Library", "Application Support", "GetWrite"),
  path.join(homedir(), "Library", "Logs", "GetWrite"),
  path.join(homedir(), "Documents", "GetWrite"),
];
const J = (x) => JSON.stringify(x);
const strip = (s, run) => redact(s).split(run.dir).join("<run-dir>");

const lsofRaw = () => {
  try { return require("node:child_process").execFileSync("lsof", ["-nP", "-iTCP:7340", "-iTCP:3000", "-iTCP:6006", "-sTCP:LISTEN"], { encoding: "utf8" }); } catch (e) { return `(empty output, exit ${e.status})`; }
};
const require = createRequire(import.meta.url);

say(`lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN BEFORE: ${J(lsofRaw())}`);
say(`ports before: ${preflight([APP_PORT])}`);
say(`git status --short projects/ BEFORE: ${repoProjectsStatus()}`);
const run = createRun("docx");
const logName = `gw-f88-throwaway-${run.runId}`;
const logDir = path.join(homedir(), "Library", "Logs", logName);
const fake = path.join(run.dir, "repo");
mkdirSync(path.join(fake, "electron"), { recursive: true });
mkdirSync(path.join(fake, "projects"));
cpSync(path.join(REPO, "electron/dist"), path.join(fake, "electron/dist"), { recursive: true });
const pkg = JSON.parse(readFileSync(path.join(REPO, "electron/package.json"), "utf8"));
pkg.name = logName;
delete pkg.productName;
writeFileSync(path.join(fake, "electron/package.json"), JSON.stringify(pkg, null, 2));
cpSync(path.join(REPO, "package.json"), path.join(fake, "package.json"));
cpSync(path.join(REPO, "pnpm-workspace.yaml"), path.join(fake, "pnpm-workspace.yaml"));
symlinkSync(path.join(REPO, "frontend"), path.join(fake, "frontend"));
symlinkSync(path.join(REPO, "getwrite-config"), path.join(fake, "getwrite-config"));
assertThrowaway(path.join(fake, "projects"));
const userData = path.join(run.dir, "userdata");
mkdirSync(userData);
assertThrowaway(userData);
const launchCwd = path.join(run.dir, "launchdir");
mkdirSync(launchCwd);
assertThrowaway(launchCwd);
const fx = path.join(run.dir, "fixtures");
mkdirSync(fx);
cpSync(path.join(REPO, "frontend/tests/fixtures/docx/multi-heading.docx"), path.join(fx, "multi-heading.docx"));
say(`fake root electron dir (the cwd the unfixed D-8 record used): <run-dir>/repo/electron; this run's launch cwd: <run-dir>/launchdir; differ: ${launchCwd !== path.join(fake, "electron")}`);

const rec = new Recorder();
let app;
let code = 0;
const consoleLines = [];
try {
  const { _electron } = createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
  app = await _electron.launch({
    executablePath: ELECTRON_BIN,
    args: [path.join(fake, "electron"), `--user-data-dir=${userData}`],
    cwd: launchCwd,
    env: (() => { const e = { ...process.env }; for (const k of ["DATABASE_URL", "BETTER_AUTH_SECRET", "GETWRITE_ENABLE_DEV_IDENTITY", "GETWRITE_BIND", "HOSTNAME", "GETWRITE_SHARING", "GETWRITE_WINDOW_SECRET", "GETWRITE_SHARING_DIR", "GETWRITE_PROJECTS_DIR", "GETWRITE_PROJECT_TYPES_DIR", "ELECTRON_RUN_AS_NODE", "PORT"]) delete e[k]; return e; })(),
    timeout: 120000,
  });
  rec.add(app.process().pid, "electron-main");
  const info = await app.evaluate(({ app: a }) => ({ ud: a.getPath("userData"), logs: a.getPath("logs"), packaged: a.isPackaged, cwd: process.cwd() }));
  say(`app.getPath("userData") = ${strip(info.ud, run)}; app.getPath("logs") = ${strip(info.logs.replace(logName, "<throwaway-logname>"), run)}; isPackaged=${info.packaged}`);
  say(`app process.cwd() = ${strip(info.cwd, run)}`);
  const bad = ownerDirs.some((o) => info.ud.startsWith(o) || info.logs.startsWith(o)) || realpathSync(info.ud) !== realpathSync(userData) || info.logs !== logDir;
  say(`userData is the throwaway folder: ${realpathSync(info.ud) === realpathSync(userData)}; logs is the throwaway folder: ${info.logs === logDir}; under a protected folder: ${bad}`);
  if (bad) throw new Error("path assertion failed; stopping before any use");
  const page = await app.firstWindow();
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
  const body = () => page.evaluate(() => document.body.innerText);
  const dlg = async () => (await page.$$eval("[role=dialog], dialog", (ds) => ds.map((d) => d.innerText.split("\n").filter(Boolean)))).flat();
  const projects = () => readdirSync(path.join(fake, "projects")).map((d) => {
    const pj = path.join(fake, "projects", d, "project.json");
    return existsSync(pj) ? { dir: d.slice(0, 8), projectJson: true, name: JSON.parse(readFileSync(pj, "utf8")).name, type: JSON.parse(readFileSync(pj, "utf8")).projectType } : { dir: d.slice(0, 8), projectJson: false };
  });
  await page.waitForTimeout(2000);
  for (const type of ["blank", "novel"]) {
    const before = readdirSync(path.join(fake, "projects")).length;
    const c0 = consoleLines.length;
    await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, path.join(fx, "multi-heading.docx"));
    await page.click("button:has-text('Import Word Document')");
    await page.waitForTimeout(600);
    await page.click("button:has-text('CHOOSE DOCUMENT')");
    await page.waitForTimeout(1200);
    const opts = await page.$$eval("select", (ss) => ss.map((s) => [...s.options].map((o) => o.value + "=" + o.textContent)));
    if (type === "blank") say(`select options: ${J(opts)}`);
    const sel = page.locator("select").nth(1);
    await sel.selectOption(type);
    say(`[${type}] chosen project type select value: ${await sel.inputValue()}`);
    await page.click("button[type=submit]");
    await page.waitForTimeout(8000);
    const d = await dlg();
    say(`[${type}] dialog text after Start (8 s): ${J(d.map((l) => strip(l, run)))}`);
    const after = projects();
    say(`[${type}] projects dir entries before=${before} after=${after.length}; projects: ${J(after)}`);
    say(`[${type}] page console lines during import: ${J(consoleLines.slice(c0).map((l) => strip(l, run)))}`);
    await page.goto(`http://localhost:${APP_PORT}/`);
    await page.waitForTimeout(2500);
  }
  const logFile = path.join(logDir, "getwrite.log");
  const lines = existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").filter(Boolean) : null;
  say(`app log file present at throwaway logs folder: ${lines !== null}; line count: ${lines ? lines.length : 0}`);
  if (lines) for (const l of lines) say(`app log: ${strip(l, run).slice(0, 300)}`);
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
