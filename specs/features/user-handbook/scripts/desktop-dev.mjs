#!/usr/bin/env node
/**
 * Feature 81 desktop method (FR-15 method 1): the unpackaged Electron app run
 * from a throwaway "fake repo root", with --user-data-dir and a throwaway app
 * `name` (so app.getPath("logs") is a throwaway folder). Modelled on
 * specs/features/desktop-server-port/scripts/dev-ports.mjs.
 *
 * Usage: node desktop-dev.mjs            proof run: start, assert paths, capture
 *                                        title + screenshot, stop, clean up.
 * Import { startDesktop, stopDesktop } from this module for longer sessions.
 *
 * The desktop app listens on the fixed port 7340 (electron/src/server-config.ts);
 * the script refuses if anything listens there. 3000 and 6006 are recorded.
 * Requires built electron/dist and frontend/.next/standalone in the MAIN
 * checkout. Run OUTSIDE the command sandbox.
 */
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  LOG_DIR, REPO, Recorder, assertThrowaway, cleanupRun, createRun, errLine, isMain, listeners,
  preflight, protectedPortsState, redact, repoProjectsStatus, say, sleep,
} from "./lib/safety.mjs";

const APP_PORT = 7340;
const ELECTRON_BIN = path.join(REPO, "electron/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const ownerDirs = [
  path.join(homedir(), "Library", "Application Support", "getwrite-electron"),
  path.join(homedir(), "Library", "Logs", "getwrite-electron"),
  path.join(homedir(), "Documents", "GetWrite"),
];

function cleanEnv() {
  const env = { ...process.env };
  for (const k of ["DATABASE_URL", "BETTER_AUTH_SECRET", "GETWRITE_ENABLE_DEV_IDENTITY", "GETWRITE_BIND", "HOSTNAME", "GETWRITE_SHARING", "GETWRITE_WINDOW_SECRET", "GETWRITE_SHARING_DIR", "GETWRITE_PROJECTS_DIR", "ELECTRON_RUN_AS_NODE", "PORT"]) delete env[k];
  return env;
}

function buildFakeRoot(run, logName) {
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
  return fake;
}

export async function startDesktop(run) {
  if (!existsSync(ELECTRON_BIN)) throw new Error("electron binary missing");
  if (!existsSync(path.join(REPO, "frontend/.next/standalone/frontend/server.js"))) throw new Error("built standalone server missing; run pnpm build in frontend/");
  const logName = `gw-handbook-throwaway-${run.runId}`;
  const logDir = path.join(homedir(), "Library", "Logs", logName);
  const fake = buildFakeRoot(run, logName);
  const userData = path.join(run.dir, "userdata");
  mkdirSync(userData);
  assertThrowaway(userData);
  const { _electron } = createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
  const rec = new Recorder();
  const app = await _electron.launch({
    executablePath: ELECTRON_BIN,
    args: [path.join(fake, "electron"), `--user-data-dir=${userData}`],
    env: cleanEnv(),
    timeout: 120000,
  });
  rec.add(app.process().pid, "electron-main");
  const handle = { app, rec, fake, userData, logDir, logName, projectsDir: path.join(fake, "projects"), run };
  // Assert the app's own reported paths BEFORE doing anything else with it.
  const info = await app.evaluate(({ app: a }) => ({ ud: a.getPath("userData"), logs: a.getPath("logs"), packaged: a.isPackaged }));
  handle.info = info;
  const sameUd = realpathSync(info.ud) === realpathSync(userData);
  const bad = ownerDirs.some((o) => info.ud.startsWith(o) || info.logs.startsWith(o)) || !sameUd || info.logs !== logDir;
  handle.sameUd = sameUd;
  if (bad) {
    await stopDesktop(handle, { skipCleanup: true });
    throw new Error("app reports a userData/logs path that is not the throwaway one; stopped");
  }
  const page = await app.firstWindow();
  handle.page = page;
  for (let i = 0; i < 90; i++) {
    rec.walk(process.pid);
    if (page.url().startsWith(`http://localhost:${APP_PORT}`) && (await page.evaluate(() => document.readyState)) === "complete") break;
    await sleep(1000);
  }
  rec.walk(process.pid);
  return handle;
}

export function appLogLines(handle) {
  try {
    return readFileSync(path.join(handle.logDir, "getwrite.log"), "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export async function stopDesktop(handle, opts = {}) {
  const out = {};
  await Promise.race([handle.app.close(), sleep(20000)]).catch((e) => say(`app.close: ${errLine(e)}`));
  await sleep(2000);
  handle.rec.walk(process.pid);
  out.stop = await handle.rec.stop();
  out.listenersOnApp = listeners(APP_PORT).join(",") || "none";
  if (!opts.skipCleanup) {
    rmSync(handle.logDir, { recursive: true, force: true });
    out.logDirRemoved = !existsSync(handle.logDir);
  }
  return out;
}

async function proof() {
  const pre = preflight([APP_PORT]);
  say(`ports before (lsof -nP -iTCP:<port> -sTCP:LISTEN): ${pre}`);
  say(`git status --short projects/ BEFORE: ${repoProjectsStatus()}`);
  const run = createRun("desktop");
  say(`run id: ${run.runId} (throwaway root asserted under /tmp/getwrite-handbook/)`);
  let handle;
  let code = 0;
  try {
    handle = await startDesktop(run);
    say(`electron pid=${handle.app.process().pid}; isPackaged=${handle.info.packaged}`);
    say(`app-reported userData == throwaway userdata folder: ${handle.sameUd}`);
    say(`app-reported logs folder == throwaway log folder: ${handle.info.logs === handle.logDir} (${handle.logName})`);
    const lines = appLogLines(handle);
    for (const l of lines.filter((x) => /projectsDir|standaloneDir|port|listening|ready/i.test(x)).slice(0, 12)) say(`app log: ${redact(l).slice(0, 200).replace(run.dir, "<run-dir>")}`);
    const title = await handle.page.title();
    say(`window url: http://localhost:${APP_PORT}${new URL(handle.page.url()).pathname}; title: ${JSON.stringify(title)}`);
    const text = String(await handle.page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 160);
    say(`window text (first 160 chars): ${JSON.stringify(text)}`);
    const shot = path.join(LOG_DIR, `${run.runId}-window.png`);
    await handle.page.screenshot({ path: shot });
    say(`screenshot: ${shot} (exists: ${existsSync(shot)})`);
    handle.rec.walk(process.pid);
    say(`pids recorded: ${handle.rec.describe()}`);
    say(`listeners on ${APP_PORT} while running: ${listeners(APP_PORT).join(",") || "none"}`);
    const logCopy = path.join(LOG_DIR, `${run.runId}-app.log`);
    writeFileSync(logCopy, appLogLines(handle).map((l) => redact(l).replace(run.dir, "<run-dir>")).join("\n"));
  } catch (e) {
    say(`script error: ${errLine(e)}`);
    code = 1;
  } finally {
    if (handle) {
      const o = await stopDesktop(handle);
      say(`stop: recorded ${o.stop.recorded}; ${o.stop.stages.join("; ") || "all exited after app.close"}`);
      say(`listener on ${APP_PORT} after stop: ${o.listenersOnApp}; throwaway log folder removed: ${o.logDirRemoved}`);
    }
    const c = cleanupRun(run);
    say(`throwaway run folder removed: ${c.removed}`);
    say(`ports after: ${protectedPortsState()}`);
    say(`git status --short projects/ AFTER: ${repoProjectsStatus()}`);
  }
  process.exit(code);
}

if (isMain(import.meta.url)) await proof();
