#!/usr/bin/env node
/**
 * Feature 88 Task 5: Word import in the UNPACKED (electron-builder --dir) build,
 * launched from a chosen working directory. Usage:
 *   node docx-import-packaged.mjs <app-binary> <launch-cwd> [<label>]
 * The app was built with a throwaway productName AND throwaway package name
 * (-c.extraMetadata), so its default logs folder is throwaway. A throwaway
 * --user-data-dir and a seeded workspace.json (projectsDir = throwaway) are used.
 * The first action after launch asserts app.getPath("userData")/("logs") are
 * the throwaway ones and not under a protected folder; if not, nothing else runs.
 * Run OUTSIDE the command sandbox. Never reads/writes the owner's folders.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  Recorder, REPO, assertThrowaway, cleanupRun, createRun, errLine, listeners, preflight,
  redact, repoProjectsStatus, say, sleep,
} from "./lib/safety.mjs";

const [binary, launchCwd, label = "run"] = process.argv.slice(2);
if (!binary || !launchCwd) { console.error("usage: <app-binary> <launch-cwd> [label]"); process.exit(2); }
if (!existsSync(binary) || !binary.startsWith("/tmp/getwrite-f88/build/")) { console.error("binary must be under /tmp/getwrite-f88/build/"); process.exit(2); }
const APP_PORT = 7340;
const require = createRequire(import.meta.url);
const ownerDirs = [
  path.join(homedir(), "Library", "Application Support", "getwrite-electron"),
  path.join(homedir(), "Library", "Logs", "getwrite-electron"),
  path.join(homedir(), "Library", "Application Support", "GetWrite"),
  path.join(homedir(), "Library", "Logs", "GetWrite"),
  path.join(homedir(), "Documents", "GetWrite"),
  path.join(REPO, "projects"),
];
const J = (x) => JSON.stringify(x);
const lsofRaw = () => {
  try { return execFileSync("lsof", ["-nP", "-iTCP:7340", "-iTCP:3000", "-iTCP:6006", "-sTCP:LISTEN"], { encoding: "utf8" }); } catch (e) { return `(empty output, exit ${e.status})`; }
};
const strip = (s, run) => redact(s).split(run.dir).join("<run-dir>");

say(`launch cwd requested: ${launchCwd}`);
say(`lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN BEFORE: ${J(lsofRaw())}`);
say(`ports before: ${preflight([APP_PORT])}`);
say(`git status --short projects/ BEFORE: ${repoProjectsStatus()}`);
const run = createRun(`pkg-${label}`);
const userData = path.join(run.dir, "userdata");
const projectsDir = path.join(run.dir, "workspace");
const fx = path.join(run.dir, "fixtures");
for (const d of [userData, projectsDir, fx]) { mkdirSync(d); assertThrowaway(d); }
writeFileSync(path.join(userData, "workspace.json"), JSON.stringify({ projectsDir }));
cpSync(path.join(REPO, "frontend/tests/fixtures/docx/multi-heading.docx"), path.join(fx, "multi-heading.docx"));
const logDir = path.join(homedir(), "Library", "Logs", "GwF88Throwaway");

const rec = new Recorder();
let app;
let code = 0;
const consoleLines = [];
try {
  const { _electron } = createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
  const env = { ...process.env };
  for (const k of ["DATABASE_URL", "BETTER_AUTH_SECRET", "GETWRITE_ENABLE_DEV_IDENTITY", "GETWRITE_BIND", "HOSTNAME", "GETWRITE_SHARING", "GETWRITE_WINDOW_SECRET", "GETWRITE_SHARING_DIR", "GETWRITE_PROJECTS_DIR", "GETWRITE_PROJECT_TYPES_DIR", "ELECTRON_RUN_AS_NODE", "PORT"]) delete env[k];
  app = await _electron.launch({ executablePath: binary, args: [`--user-data-dir=${userData}`], cwd: launchCwd, env, timeout: 120000 });
  rec.add(app.process().pid, "electron-main");
  // FIRST ACTION: path assertion.
  const info = await app.evaluate(({ app: a }) => ({ ud: a.getPath("userData"), logs: a.getPath("logs"), packaged: a.isPackaged, name: a.getName(), cwd: process.cwd(), res: process.resourcesPath }));
  say(`app.getPath("userData") = ${strip(info.ud, run)}; app.getPath("logs") = ${info.logs.replace(homedir(), "~")}; isPackaged=${info.packaged}; app.getName()=${info.name}`);
  say(`app process.cwd() = ${strip(info.cwd, run)}`);
  const under = (p) => ownerDirs.some((o) => p === o || p.startsWith(o + path.sep));
  const bad = under(info.ud) || under(info.logs) || realpathSync(info.ud) !== realpathSync(userData) || info.logs !== logDir;
  say(`userData is the throwaway folder: ${realpathSync(info.ud) === realpathSync(userData)}; logs is the expected throwaway folder: ${info.logs === logDir}; either under a protected folder: ${under(info.ud) || under(info.logs)}`);
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
  say(`page url prefix ok: ${page.url().startsWith(`http://localhost:${APP_PORT}`)}`);
  say(`pids started (electron main + descendants): ${rec.describe()}`);
  say(`lsof 7340 while running: ${listeners(APP_PORT).join(",") || "none"}`);
  const dlg = async () => (await page.$$eval("[role=dialog], dialog", (ds) => ds.map((d) => d.innerText.split("\n").filter(Boolean)))).flat();
  const projects = () => readdirSync(projectsDir).map((d) => {
    const pj = path.join(projectsDir, d, "project.json");
    if (!existsSync(pj)) return { dir: d.slice(0, 8), projectJson: false };
    const j = JSON.parse(readFileSync(pj, "utf8"));
    return { dir: d.slice(0, 8), projectJson: true, name: j.name, type: j.projectType };
  });
  await page.waitForTimeout(2000);
  for (const type of ["blank", "novel"]) {
    const before = readdirSync(projectsDir).length;
    const c0 = consoleLines.length;
    await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, path.join(fx, "multi-heading.docx"));
    await page.click("button:has-text('Import Word Document')");
    await page.waitForTimeout(600);
    await page.click("button:has-text('CHOOSE DOCUMENT')");
    await page.waitForTimeout(1200);
    const sel = page.locator("select").nth(1);
    await sel.selectOption(type);
    say(`[${type}] chosen project type select value: ${await sel.inputValue()}`);
    await page.click("button[type=submit]");
    await page.waitForTimeout(8000);
    say(`[${type}] dialog text after Start (8 s): ${J((await dlg()).map((l) => strip(l, run)))}`);
    const after = projects();
    say(`[${type}] projects dir entries before=${before} after=${after.length}; projects: ${J(after)}`);
    say(`[${type}] page console lines during import: ${J(consoleLines.slice(c0).map((l) => strip(l, run)))}`);
    await page.goto(`http://localhost:${APP_PORT}/`);
    await page.waitForTimeout(2500);
  }
  const logFile = path.join(logDir, "getwrite.log");
  const lines = existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").filter(Boolean) : null;
  say(`app log present in throwaway logs folder: ${lines !== null}; line count: ${lines ? lines.length : 0}`);
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
