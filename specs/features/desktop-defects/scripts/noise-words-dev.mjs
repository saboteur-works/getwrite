#!/usr/bin/env node
/**
 * Feature 88 Task 8: add a global noise word in App Settings of the development
 * app, close the app, relaunch with the SAME throwaway user-data directory and
 * record what is listed and stored. Modelled on docx-import-dev.mjs (copied fake
 * root, --user-data-dir, throwaway app name so `logs` is throwaway, launch cwd
 * not <fake root>/electron). Run OUTSIDE the command sandbox from the main
 * checkout. Never touches the owner's userData/logs/workspace folders or projects/.
 */
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  Recorder, REPO, assertThrowaway, cleanupRun, createRun, errLine, listeners, preflight,
  redact, repoProjectsStatus, say, sleep,
} from "./lib/safety.mjs";

const APP_PORT = 7340;
const WORD = "gwf88noiseword";
const ELECTRON_BIN = path.join(REPO, "electron/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const ownerDirs = [
  path.join(homedir(), "Library", "Application Support", "getwrite-electron"),
  path.join(homedir(), "Library", "Logs", "getwrite-electron"),
  path.join(homedir(), "Library", "Application Support", "GetWrite"),
  path.join(homedir(), "Library", "Logs", "GetWrite"),
  path.join(homedir(), "Documents", "GetWrite"),
];
const J = (x) => JSON.stringify(x);
const require = createRequire(import.meta.url);
const strip = (s, run) => redact(s).split(run.dir).join("<run-dir>");
const lsofRaw = () => {
  try { return execFileSync("lsof", ["-nP", "-iTCP:7340", "-iTCP:3000", "-iTCP:6006", "-sTCP:LISTEN"], { encoding: "utf8" }); } catch (e) { return `(empty output, exit ${e.status})`; }
};

say(`lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN BEFORE: ${J(lsofRaw())}`);
say(`ports before: ${preflight([APP_PORT])}`);
say(`git status --short projects/ BEFORE: ${repoProjectsStatus()}`);
const run = createRun("noise");
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
say(`userData starts empty: ${require("node:fs").readdirSync(userData).length === 0}; launch cwd differs from <fake root>/electron: ${launchCwd !== path.join(fake, "electron")}`);

const { _electron } = createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
const env = (() => { const e = { ...process.env }; for (const k of ["DATABASE_URL", "BETTER_AUTH_SECRET", "GETWRITE_ENABLE_DEV_IDENTITY", "GETWRITE_BIND", "HOSTNAME", "GETWRITE_SHARING", "GETWRITE_WINDOW_SECRET", "GETWRITE_SHARING_DIR", "GETWRITE_PROJECTS_DIR", "GETWRITE_PROJECT_TYPES_DIR", "ELECTRON_RUN_AS_NODE", "PORT"]) delete e[k]; return e; })();
const wsFile = path.join(userData, "workspace.json");
const wsKeyValue = () => {
  if (!existsSync(wsFile)) return "workspace.json: not present";
  try { const o = JSON.parse(readFileSync(wsFile, "utf8")); return `workspace.json keys: ${J(Object.keys(o))}; globalNoiseWords = ${J(o.globalNoiseWords)}`; } catch (e) { return `workspace.json: unparseable (${errLine(e)})`; }
};
let code = 0;

async function launch(label) {
  const rec = new Recorder();
  const consoleLines = [];
  let app;
  try {
    app = await _electron.launch({ executablePath: ELECTRON_BIN, args: [path.join(fake, "electron"), `--user-data-dir=${userData}`], cwd: launchCwd, env, timeout: 120000 });
    rec.add(app.process().pid, "electron-main");
    const info = await app.evaluate(({ app: a }) => ({ ud: a.getPath("userData"), logs: a.getPath("logs"), packaged: a.isPackaged }));
    say(`[${label}] userData = ${strip(info.ud, run)}; logs = ${strip(info.logs.replace(logName, "<throwaway-logname>"), run)}; isPackaged=${info.packaged}`);
    const bad = ownerDirs.some((o) => info.ud.startsWith(o) || info.logs.startsWith(o)) || realpathSync(info.ud) !== realpathSync(userData) || info.logs !== logDir;
    say(`[${label}] userData is throwaway: ${realpathSync(info.ud) === realpathSync(userData)}; logs is throwaway: ${info.logs === logDir}; under protected folder: ${bad}`);
    if (bad) throw new Error("path assertion failed; stopping before any use");
    const page = await app.firstWindow();
    page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
    for (let i = 0; i < 90; i++) {
      rec.walk(process.pid);
      if (page.url().startsWith(`http://localhost:${APP_PORT}`) && (await page.evaluate(() => document.readyState)) === "complete") break;
      await sleep(1000);
    }
    await page.waitForTimeout(2500);
    rec.walk(process.pid);
    say(`[${label}] lsof 7340 while running: ${listeners(APP_PORT).join(",") || "none"}`);
    await page.click("button[aria-label='App Settings']");
    await page.waitForTimeout(2000);
    const dlg = async () => (await page.$$eval("[role=dialog]", (ds) => ds.map((d) => d.innerText.split("\n").filter(Boolean)))).flat();
    const listed = async () => (await page.$$eval("[role=dialog] ul li span", (s) => s.map((x) => x.textContent)));
    say(`[${label}] words listed on open: ${J(await listed())}`);
    if (label === "first") {
      await page.fill("input[aria-label='New noise word']", WORD);
      await page.click("[role=dialog] form button[type=submit]");
      await page.waitForTimeout(3000);
      say(`[first] words listed after Add: ${J(await listed())}`);
      const text = (await dlg()).join(" | ") + " || body: " + (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      say(`[first] "Could not save the noise-word list." visible: ${text.includes("Could not save the noise-word list.")}`);
      say(`[first] dialog+body text: ${strip(text, run).slice(0, 700)}`);
      say(`[first] ${wsKeyValue()}`);
    } else {
      say(`[second] dialog text: ${strip((await dlg()).join(" | "), run).slice(0, 500)}`);
    }
    const logFile = path.join(logDir, "getwrite.log");
    const lines = existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").filter(Boolean) : [];
    const rel = lines.filter((l) => /noise|workspace|Failed|error/i.test(l));
    say(`[${label}] app log lines so far: ${lines.length}; lines matching noise|workspace|Failed|error: ${J(rel.map((l) => strip(l, run).slice(0, 300)))}`);
    say(`[${label}] page console (${consoleLines.length}): ${J(consoleLines.map((l) => strip(l, run).slice(0, 200)))}`);
    rec.walk(process.pid);
  } catch (e) {
    say(`[${label}] script error: ${errLine(e)}`);
    code = 1;
  } finally {
    if (app) {
      rec.walk(process.pid);
      const all = rec.describe();
      say(`[${label}] pids started: ${all}`);
      await Promise.race([app.close(), sleep(20000)]).catch((e) => say(`app.close: ${errLine(e)}`));
      await sleep(2000);
      const o = await rec.stop();
      say(`[${label}] stop by pid: ${o.stages.join("; ") || "all exited after app.close"}`);
      say(`[${label}] lsof 7340 after stop: ${listeners(APP_PORT).join(",") || "none"}`);
    }
  }
}

await launch("first");
say(`after first close: ${wsKeyValue()}`);
if (code === 0 && listeners(APP_PORT).length === 0) await launch("second");
say(`after second close: ${wsKeyValue()}`);
rmSync(logDir, { recursive: true, force: true });
say(`throwaway log folder removed: ${!existsSync(logDir)}`);
say(`throwaway run folder removed: ${cleanupRun(run).removed}`);
say(`lsof AFTER: ${J(lsofRaw())}`);
say(`git status --short projects/ AFTER: ${repoProjectsStatus()}`);
process.exit(code);
