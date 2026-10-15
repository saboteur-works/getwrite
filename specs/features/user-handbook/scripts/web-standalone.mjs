#!/usr/bin/env node
/**
 * Feature 81 web method (FR-15 method 2): the BUILT standalone server of the
 * same frontend, with throwaway GETWRITE_PROJECTS_DIR on a free port.
 * Modelled on specs/features/two-client-save-measurement/scripts/lib/server.mjs.
 *
 * Usage: node web-standalone.mjs   proof run: start, GET /, stop, clean up.
 * Import { startWeb, stopWeb } for longer sessions (Playwright etc.).
 *
 * Sharing, hosted auth and dev identity are all left off. Needs
 * frontend/.next/standalone (pnpm build in frontend/, main checkout, with
 * .next/static copied into .next/standalone/frontend/.next/static).
 * Run OUTSIDE the command sandbox.
 */
import { spawn } from "node:child_process";
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  LOG_DIR, REPO, Recorder, assertThrowaway, cleanupRun, createRun, errLine, isMain, listeners,
  pickFreePort, PROTECTED_PORTS, preflight, protectedPortsState, repoProjectsStatus, say, sleep,
} from "./lib/safety.mjs";

const SERVER_JS = path.join(REPO, "frontend/.next/standalone/frontend/server.js");

export async function startWeb(run, opts = {}) {
  if (!existsSync(SERVER_JS)) throw new Error("built standalone server.js is missing");
  let port = await pickFreePort();
  while (PROTECTED_PORTS.includes(port)) port = await pickFreePort();
  const pre = preflight([port]);
  const projectsDir = path.join(run.dir, "projects");
  mkdirSync(projectsDir);
  assertThrowaway(projectsDir);
  const serverLog = path.join(LOG_DIR, `${run.runId}-server.log`);
  const env = { ...process.env };
  for (const k of ["DATABASE_URL", "BETTER_AUTH_SECRET", "GETWRITE_ENABLE_DEV_IDENTITY", "GETWRITE_SHARING", "GETWRITE_BIND", "GETWRITE_WINDOW_SECRET", "GETWRITE_SHARING_DIR", "GETWRITE_DESKTOP"]) delete env[k];
  // Task 3 addition: opts.copyTemplates puts a throwaway COPY of the project-type
  // specs under the run folder, so a Project Type Manager save or delete cannot
  // reach the repo's getwrite-config/.
  let templatesDir = path.join(REPO, "getwrite-config/templates/project-types");
  if (opts.copyTemplates) {
    const copy = path.join(run.dir, "templates");
    cpSync(templatesDir, copy, { recursive: true });
    assertThrowaway(copy);
    templatesDir = copy;
  }
  Object.assign(env, {
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    GETWRITE_PROJECTS_DIR: projectsDir,
    GETWRITE_TEMPLATES_DIR: templatesDir,
  });
  const fd = openSync(serverLog, "a");
  let child;
  try {
    child = spawn(process.execPath, [SERVER_JS], { cwd: path.dirname(SERVER_JS), env, stdio: ["ignore", fd, fd] });
  } finally {
    closeSync(fd);
  }
  const rec = new Recorder();
  rec.add(child.pid, "node");
  const handle = { port, pid: child.pid, child, rec, projectsDir, templatesDir, serverLog, baseUrl: `http://127.0.0.1:${port}`, run, portsBefore: pre };
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) {
      await stopWeb(handle);
      throw new Error("server exited before ready");
    }
    try {
      const res = await fetch(`${handle.baseUrl}/`);
      handle.firstStatus = res.status;
      if (res.status === 200) break;
    } catch {
      // not listening yet
    }
    await sleep(200);
  }
  rec.walk(child.pid);
  return handle;
}

export async function stopWeb(handle) {
  if (handle.child.exitCode === null) handle.rec.walk(handle.child.pid);
  const stop = await handle.rec.stop();
  return { stop, listenersOnPort: listeners(handle.port).join(",") || "none" };
}

async function proof() {
  const run = createRun("web");
  say(`run id: ${run.runId} (throwaway root asserted under /tmp/getwrite-handbook/)`);
  say(`git status --short projects/ BEFORE: ${repoProjectsStatus()}`);
  let handle;
  let code = 0;
  try {
    say(`ports before: ${protectedPortsState()}`);
    handle = await startWeb(run);
    say(`server pid=${handle.pid} on port ${handle.port} (chosen free port; not 7340/3000/6006)`);
    const res = await fetch(`${handle.baseUrl}/`);
    say(`GET / -> ${res.status}`);
    const pt = await fetch(`${handle.baseUrl}/api/project-types`);
    say(`GET /api/project-types -> ${pt.status}`);
    say(`projects folder in use: <run-dir>/projects (GETWRITE_PROJECTS_DIR, asserted); entries now: ${readdirSync(handle.projectsDir).length}`);
    say(`pids recorded: ${handle.rec.describe()}`);
    say(`listeners on ${handle.port} while running: ${listeners(handle.port).join(",") || "none"}`);
  } catch (e) {
    say(`script error: ${errLine(e)}`);
    code = 1;
  } finally {
    if (handle) {
      const o = await stopWeb(handle);
      say(`stop: recorded ${o.stop.recorded}; ${o.stop.stages.join("; ") || "exited on SIGTERM"}`);
      say(`listener on ${handle.port} after stop: ${o.listenersOnPort}`);
    }
    say(`throwaway run folder removed: ${cleanupRun(run).removed}`);
    say(`ports after: ${protectedPortsState()}`);
    say(`git status --short projects/ AFTER: ${repoProjectsStatus()}`);
  }
  process.exit(code);
}

if (isMain(import.meta.url)) await proof();
