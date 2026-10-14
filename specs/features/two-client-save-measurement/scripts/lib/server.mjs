/**
 * Feature 78 harness: start, watch and stop the BUILT standalone server.
 *
 * Properties (each shown by the printed record of a run, not asserted here):
 * - started from `frontend/.next/standalone/frontend/server.js` with sharing on
 *   (GETWRITE_SHARING=1, bind 0.0.0.0 as Feature 80's scripts do), on a free
 *   port this module picks (bind port 0, read, release, re-check immediately
 *   before the start); never 7340 or 3000;
 * - throwaway GETWRITE_SHARING_DIR, GETWRITE_PROJECTS_DIR and window secret
 *   under /tmp/getwrite-two-client/<run-id>/, every path asserted after
 *   realpath (the process exits otherwise); the secret is never recorded;
 * - the pid and every descendant are recorded (ps walk); the server is stopped
 *   by those recorded pids only, never by port or name;
 * - listener status of 7340 and 3000 is recorded and never acted on;
 * - the throwaway folders are removed afterwards and the removal confirmed.
 *
 * Logs go to /tmp/getwrite-two-client/logs/ (not the sandbox $TMPDIR).
 */
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  realpathSync,
  rmSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { FRONTEND, errLine, sleep } from "./util.mjs";

export const RUN_BASE = "/tmp/getwrite-two-client";
export const LOG_DIR = path.join(RUN_BASE, "logs");
export const SERVER_JS = path.join(
  FRONTEND,
  ".next/standalone/frontend/server.js",
);
const PROTECTED_PORTS = [7340, 3000];
const FORBIDDEN_FRAGMENTS = [
  "getwrite-electron",
  "Documents/GetWrite",
  "/getwrite/projects",
];

export function listeners(port) {
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
    });
    return out
      .split("\n")
      .slice(1)
      .filter(Boolean)
      .map((l) => {
        const c = l.split(/\s+/);
        return `${c[1]}(${c[0]})`;
      });
  } catch {
    return [];
  }
}

function psTable() {
  return execFileSync("ps", ["-A", "-o", "pid=,ppid=,comm="], {
    encoding: "utf8",
  })
    .split("\n")
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map((m) => ({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      comm: path.basename(m[3]),
    }));
}

/** Pids of `rootPid` and every descendant, with the command name at this moment. */
export function descendantsOf(rootPid) {
  const table = psTable();
  const set = new Set([rootPid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of table) {
      if (set.has(p.ppid) && !set.has(p.pid)) {
        set.add(p.pid);
        grew = true;
      }
    }
  }
  // The ps process spawned by this very call is a child of the caller; leave it out.
  return table.filter((p) => set.has(p.pid) && p.comm !== "ps");
}

export function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

/** Exit the process unless `p` resolves under the run base and is not an owner folder. */
export function assertThrowaway(p, base = RUN_BASE) {
  let real;
  let realBase;
  try {
    real = realpathSync(p);
    realBase = realpathSync(base);
  } catch (e) {
    console.error(`throwaway path assertion failed (cannot resolve): ${errLine(e)}`);
    process.exit(5);
  }
  const homeDocs = path.join(os.homedir(), "Documents");
  const bad =
    !(real === realBase || real.startsWith(realBase + path.sep)) ||
    FORBIDDEN_FRAGMENTS.some((f) => real.includes(f)) ||
    real.startsWith(homeDocs);
  if (bad) {
    console.error("throwaway path assertion failed: path is not under the run base");
    process.exit(5);
  }
  return real;
}

export function ensureBase() {
  mkdirSync(RUN_BASE, { recursive: true });
  mkdirSync(LOG_DIR, { recursive: true });
  assertThrowaway(LOG_DIR);
}

export function createRun(label) {
  ensureBase();
  const runId = `${label}-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const dir = path.join(RUN_BASE, runId);
  const sharingDir = path.join(dir, "sharing");
  const projectsDir = path.join(dir, "projects");
  for (const d of [dir, sharingDir, projectsDir]) mkdirSync(d, { recursive: true });
  return {
    runId,
    dir: assertThrowaway(dir),
    sharingDir: assertThrowaway(sharingDir),
    projectsDir: assertThrowaway(projectsDir),
    serverLog: path.join(LOG_DIR, `${runId}-server.log`),
  };
}

export function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "0.0.0.0", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** First private IPv4 address of this host, or null. */
export function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (
        a.family === "IPv4" &&
        !a.internal &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)
      ) {
        return a.address;
      }
    }
  }
  return null;
}

/**
 * Start the server. Returns a handle. The window secret lives only inside the
 * closure of `windowFetch`; it is not a property of the handle, so printing or
 * serialising the handle cannot leak it.
 */
export async function startServer(run) {
  if (!existsSync(SERVER_JS)) throw new Error("built standalone server.js is missing");
  const before = {};
  for (const p of PROTECTED_PORTS) before[p] = listeners(p);

  let port = await pickFreePort();
  while (PROTECTED_PORTS.includes(port)) port = await pickFreePort();
  const busy = listeners(port);
  if (busy.length) throw new Error(`chosen port ${port} is busy; refusing`);
  const secret = randomBytes(32).toString("hex");

  const env = { ...process.env };
  for (const k of [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "GETWRITE_ENABLE_DEV_IDENTITY",
  ]) {
    delete env[k];
  }
  Object.assign(env, {
    PORT: String(port),
    HOSTNAME: "0.0.0.0",
    GETWRITE_BIND: "0.0.0.0",
    GETWRITE_SHARING: "1",
    GETWRITE_SHARING_DIR: run.sharingDir,
    GETWRITE_PROJECTS_DIR: run.projectsDir,
    GETWRITE_WINDOW_SECRET: secret,
  });
  const fd = openSync(run.serverLog, "a");
  let child;
  try {
    child = spawn(process.execPath, [SERVER_JS], {
      cwd: path.dirname(SERVER_JS),
      env,
      stdio: ["ignore", fd, fd],
    });
  } finally {
    closeSync(fd);
  }

  const known = new Map([[child.pid, "node"]]);
  const lan = lanAddress();
  const host = lan ?? "127.0.0.1";
  const handle = {
    port,
    pid: child.pid,
    runId: run.runId,
    projectsDir: run.projectsDir,
    sharingDir: run.sharingDir,
    host,
    hostKind: lan
      ? "private LAN IPv4 of this host (host to itself, not a second-device result)"
      : "loopback (host to itself, not a second-device result)",
    baseUrl: `http://${host}:${port}`,
    child,
    known,
    listenersBefore: before,
  };

  const windowFetch = async (urlPath, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = { "x-getwrite-window": secret, ...(init.headers ?? {}) };
    if (method !== "GET" && method !== "HEAD") headers.origin = handle.baseUrl;
    return fetch(`${handle.baseUrl}${urlPath}`, { ...init, method, headers });
  };
  handle.windowFetch = windowFetch;

  try {
    for (let i = 0; i < 300; i += 1) {
      if (child.exitCode !== null) throw new Error("server exited before ready");
      try {
        const res = await windowFetch("/api/auth-status");
        if (res.status === 200) break;
      } catch {
        // not listening yet
      }
      await sleep(200);
      if (i === 299) throw new Error("server did not become ready in 60 s");
    }
  } catch (e) {
    await stopServer(handle);
    throw e;
  }
  recordTree(handle);
  return handle;
}

/** Re-walk the descendants of the server pid and remember each pid with its command name. */
export function recordTree(handle) {
  for (const p of descendantsOf(handle.pid)) {
    if (p.pid !== process.pid) handle.known.set(p.pid, p.comm);
  }
  return [...handle.known.entries()].map(([pid, comm]) => ({ pid, comm }));
}

/**
 * Stop by recorded pids only. A pid is signalled only if it is still alive and
 * its command name matches the one recorded (guards against pid reuse).
 */
export async function stopServer(handle) {
  const facts = { recorded: [], stillAliveAfterTerm: [], stillAliveAfterKill: [] };
  if (handle.child.exitCode === null) recordTree(handle);
  facts.recorded = [...handle.known.entries()].map(([pid, comm]) => ({ pid, comm }));
  const sameComm = (pid) =>
    psTable().find((p) => p.pid === pid)?.comm === handle.known.get(pid);
  const live = () =>
    [...handle.known.keys()].filter((pid) => pidAlive(pid) && sameComm(pid));
  for (const pid of live()) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  await sleep(2000);
  facts.stillAliveAfterTerm = live();
  for (const pid of facts.stillAliveAfterTerm) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  if (facts.stillAliveAfterTerm.length) await sleep(1500);
  facts.stillAliveAfterKill = live();
  facts.portListenersAfter = listeners(handle.port);
  facts.listeners7340After = listeners(7340);
  facts.listeners3000After = listeners(3000);
  return facts;
}

/** Remove the run's throwaway folder (path re-asserted first) and confirm. */
export function cleanupRun(run) {
  assertThrowaway(run.dir);
  rmSync(run.dir, { recursive: true, force: true });
  return { removed: !existsSync(run.dir), path: run.dir };
}
