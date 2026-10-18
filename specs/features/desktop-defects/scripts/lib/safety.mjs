/**
 * Feature 81 run-safety helpers (FR-15 to FR-17), shared by desktop-dev.mjs,
 * web-standalone.mjs and cli.mjs.
 *
 * - every throwaway path lives under /tmp/getwrite-f88/runs/<run-id>/ and is
 *   asserted by realpath before anything starts (the process exits otherwise);
 * - ports are checked with `lsof -nP -iTCP:<port> -sTCP:LISTEN`; 7340, 3000
 *   and 6006 are recorded and never acted on;
 * - a process recorder remembers every pid started and every descendant (ps
 *   walk) and stops ONLY those pids, by pid, never by name or port;
 * - nothing here reads, lists or writes the owner's userData, workspace or
 *   log folders, or the repo's projects/.
 *
 * Run anything that uses lsof/ps on processes OUTSIDE the command sandbox.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export const BASE = "/tmp/getwrite-f88/runs";
export const LOG_DIR = path.join(BASE, "logs");
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
export const PROTECTED_PORTS = [7340, 3000, 6006];
const FORBIDDEN_FRAGMENTS = ["getwrite-electron", "Documents/GetWrite", "/getwrite/projects"];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const errLine = (e) => (e instanceof Error ? e.message.split("\n")[0] : String(e));
export const say = (s) => console.log(s);

/** Remove ANSI codes and anything shaped like a secret (long hex/base64url runs, cookie and secret headers). */
export function redact(s) {
  return String(s)
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/(x-getwrite-window|getwrite_device|cookie|authorization|passphrase|secret)\s*[:=]\s*\S+/gi, "$1=<redacted>")
    .replace(/\b[0-9a-f]{32,}\b/gi, "<redacted-hex>");
}

export function listeners(port) {
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
    return out
      .split("\n")
      .slice(1)
      .filter(Boolean)
      .map((l) => {
        const c = l.split(/\s+/);
        return `${c[1]}(${c[0]})`;
      });
  } catch {
    return []; // lsof exits 1 when nothing matches
  }
}

/** One-line state of the three protected ports, for the record. Never acts on them. */
export function protectedPortsState() {
  return PROTECTED_PORTS.map((p) => `${p}: ${listeners(p).join(",") || "no listener"}`).join("; ");
}

export function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Exit unless `p` resolves under BASE and holds none of the owner-folder fragments. */
export function assertThrowaway(p) {
  let real;
  let realBase;
  try {
    real = realpathSync(p);
    realBase = realpathSync(BASE);
  } catch (e) {
    console.error(`throwaway path assertion failed (cannot resolve): ${errLine(e)}`);
    process.exit(5);
  }
  const bad =
    !(real === realBase || real.startsWith(realBase + path.sep)) ||
    FORBIDDEN_FRAGMENTS.some((f) => real.includes(f)) ||
    real.startsWith(path.join(os.homedir(), "Documents"));
  if (bad) {
    console.error("throwaway path assertion failed: path is not under the run base");
    process.exit(5);
  }
  return real;
}

export function ensureBase() {
  mkdirSync(LOG_DIR, { recursive: true });
  assertThrowaway(LOG_DIR);
}

/** Create BASE/<label>-<id>/ and return its asserted real path. */
export function createRun(label) {
  ensureBase();
  const runId = `${label}-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const dir = path.join(BASE, runId);
  mkdirSync(dir, { recursive: true });
  return { runId, dir: assertThrowaway(dir) };
}

export function cleanupRun(run) {
  assertThrowaway(run.dir);
  rmSync(run.dir, { recursive: true, force: true });
  return { removed: !existsSync(run.dir) };
}

// ------------------------------------------------------------ processes
function psTable() {
  return execFileSync("ps", ["-A", "-o", "pid=,ppid=,comm="], { encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), comm: path.basename(m[3]) }));
}

export function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

/** Remembers pids this run started plus their descendants; stops only those. */
export class Recorder {
  constructor() {
    this.known = new Map(); // pid -> comm at record time
  }
  add(pid, comm) {
    this.known.set(pid, comm);
  }
  /** Walk descendants of `rootPid` (own pid allowed as root) and record them. */
  walk(rootPid) {
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
    for (const p of table) {
      if (set.has(p.pid) && p.pid !== process.pid && p.comm !== "ps") this.known.set(p.pid, p.comm);
    }
  }
  describe() {
    return [...this.known.entries()].map(([pid, comm]) => `${pid}(${comm})`).join(",") || "none";
  }
  live() {
    const table = psTable();
    return [...this.known.keys()].filter((pid) => pidAlive(pid) && table.find((p) => p.pid === pid)?.comm === this.known.get(pid));
  }
  /** SIGTERM then SIGKILL to recorded, still-matching pids only. */
  async stop() {
    const recorded = this.describe();
    let left = this.live();
    const stages = [];
    for (const sig of ["SIGTERM", "SIGKILL"]) {
      if (left.length === 0) break;
      for (const pid of left) {
        try {
          process.kill(pid, sig);
        } catch {
          // already gone
        }
      }
      await sleep(sig === "SIGTERM" ? 3000 : 1500);
      left = this.live();
      stages.push(`after ${sig}: ${left.length ? left.join(",") : "none alive"}`);
    }
    return { recorded, stages };
  }
}

/** Port check that refuses when the task's own port is busy; returns the pre-state line. */
export function preflight(ownPorts) {
  const busy = ownPorts.filter((p) => listeners(p).length > 0);
  if (busy.length) {
    console.error(`refusing to run: chosen port(s) ${busy.join(",")} already have a listener`);
    process.exit(3);
  }
  return protectedPortsState();
}

/** `git status --short projects/` in the repo (the repo store is never touched by these scripts). */
export function repoProjectsStatus() {
  const out = execFileSync("git", ["-C", REPO, "status", "--short", "--", "projects/"], { encoding: "utf8" }).trim();
  return out === "" ? "(empty)" : out;
}

/** True when the module at `metaUrl` is the process entry point. */
export const isMain = (metaUrl) => process.argv[1] && fileURLToPath(metaUrl) === realpathSync(process.argv[1]);
