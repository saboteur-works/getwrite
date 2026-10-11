#!/usr/bin/env node
/**
 * Feature 80, Task 4: which port each development command LISTENS on, and what
 * happens when two dev-mode copies of the desktop app run with different
 * --user-data-dir values. Runs against TODAY's code (the port constant has not
 * changed): 3000 is the port the app uses. Valid for the mechanisms; says
 * nothing about 7340.
 *
 * Usage:
 *   node dev-ports.mjs cmd dev   [fake|repo]   `pnpm dev`   (frontend `next dev`)
 *   node dev-ports.mjs cmd start [fake|repo]   `pnpm start` (root alias for the frontend dev)
 *   node dev-ports.mjs cmd port                `PORT=<free port> pnpm dev` (next dev with PORT set)
 *   node dev-ports.mjs electron                `pnpm electron:dev` equivalent: real Electron, dev code path, copied tree
 *   node dev-ports.mjs two [pw|plain] [same]   two instances; by default two different --user-data-dir
 *                                              values, with "same" the second reuses the first's (control)
 *
 * "fake" tree = a throwaway fake repo root: a copy of electron/dist and
 * electron/package.json (with a throwaway `name`, so app.getPath("logs") does
 * not write to the owner's ~/Library/Logs/getwrite-electron), a copy of the
 * root package.json and pnpm-workspace.yaml, symlinks to the real frontend/ and
 * getwrite-config/, and an empty projects/. "repo" tree = the real repo root.
 * Every command is started with GETWRITE_PROJECTS_DIR pointing at a throwaway
 * folder (and the Electron modes use the fake tree's own projects/), so nothing
 * writes to the repo's projects/. The script snapshots the repo's projects/ (a
 * hash of the names found, not their content) before and after and prints both.
 *
 * Safety: refuses to run when anything listens on 3000 before it starts
 * anything. Starts only the processes it spawns itself; their descendants are
 * recorded by parent-pid recursion while alive (the root being this script's
 * own pid for the Playwright-launched apps) and only those recorded pids are
 * stopped, by pid, never by port. Never touches
 * ~/Library/Application Support/getwrite-electron or ~/Library/Logs/getwrite-electron.
 * Output carries no cookie, window-secret value, credential or pairing code.
 * Run OUTSIDE the command sandbox (Electron, next dev and ps need it).
 */
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import net from "node:net";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_PORT = 3000;
const SELF = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(SELF), "../../../..");
const MODE = process.argv[2];
const say = (s) => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errLine = (e) => (e instanceof Error ? e.message.split("\n")[0] : String(e));

if (!["cmd", "electron", "two"].includes(MODE)) {
  console.error("usage: dev-ports.mjs cmd <dev|start|port> [fake|repo] | electron | two [pw|plain]");
  process.exit(2);
}

// ---------------------------------------------------------------- helpers
const lsof = (args) => {
  try {
    return execFileSync("lsof", args, { encoding: "utf8" });
  } catch {
    return ""; // lsof exits 1 when nothing matches
  }
};
const listenersOn = (port) =>
  lsof(["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"])
    .split("\n")
    .slice(1)
    .filter(Boolean)
    .map((l) => {
      const c = l.split(/\s+/);
      return { pid: Number(c[1]), comm: c[0], name: c[c.length - 2] };
    });
const listenRowsForPid = (pid) =>
  lsof(["-nP", "-iTCP", "-sTCP:LISTEN", "-a", "-p", String(pid)])
    .split("\n")
    .slice(1)
    .filter(Boolean)
    .map((l) => {
      const c = l.split(/\s+/);
      return { pid: Number(c[1]), comm: c[0], name: c[c.length - 2] };
    });
const psTable = () =>
  execFileSync("ps", ["-A", "-o", "pid=,ppid=,comm="], { encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), comm: path.basename(m[3]) }));
const known = new Map(); // pid -> {comm, ppid}; only pids this script started or their descendants
const recordTree = (rootPid) => {
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
  for (const p of table) if (set.has(p.pid) && p.pid !== process.pid) known.set(p.pid, { comm: p.comm, ppid: p.ppid });
};
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};
const sameComm = (pid) => {
  const row = psTable().find((p) => p.pid === pid);
  return row !== undefined && known.get(pid) !== undefined && row.comm === known.get(pid).comm;
};
const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
const snapshotRepoProjects = () => {
  const dir = path.join(REPO, "projects");
  if (!existsSync(dir)) return "projects/ absent";
  const names = [];
  const walk = (d, depth) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      names.push(path.relative(dir, path.join(d, e.name)));
      if (e.isDirectory() && depth < 2) walk(path.join(d, e.name), depth + 1);
    }
  };
  walk(dir, 0);
  names.sort();
  return `entries(depth<=3)=${names.length} sha1(names)=${createHash("sha1").update(names.join("\n")).digest("hex").slice(0, 12)} dir-mtime=${statSync(dir).mtime.toISOString()}`;
};

// ------------------------------------------------------------ pre-checks
if (listenersOn(APP_PORT).length > 0) {
  console.error(`refusing to run: something listens on port ${APP_PORT} before this script started anything`);
  process.exit(3);
}
const ownerDirs = [
  path.join(homedir(), "Library", "Application Support", "getwrite-electron"),
  path.join(homedir(), "Library", "Logs", "getwrite-electron"),
];
const root = mkdtempSync(path.join(tmpdir(), "gw-devports-"));
const realRoot = realpathSync(root);
const assertThrowaway = (p) => {
  const real = realpathSync(p);
  if (!real.startsWith(realRoot) || ownerDirs.some((o) => real.startsWith(o))) throw new Error("path is not a throwaway path");
};
const PROJECTS_TMP = path.join(realRoot, "projects-tmp");
mkdirSync(PROJECTS_TMP);
assertThrowaway(PROJECTS_TMP);
const LOGNAME = `gw-devports-throwaway-${path.basename(realRoot)}`;
const LOGDIR = path.join(homedir(), "Library", "Logs", LOGNAME);
const fake = path.join(realRoot, "repo");
const buildFake = () => {
  mkdirSync(path.join(fake, "electron"), { recursive: true });
  mkdirSync(path.join(fake, "projects"));
  cpSync(path.join(REPO, "electron/dist"), path.join(fake, "electron/dist"), { recursive: true });
  const pkg = JSON.parse(readFileSync(path.join(REPO, "electron/package.json"), "utf8"));
  pkg.name = LOGNAME;
  delete pkg.productName;
  writeFileSync(path.join(fake, "electron/package.json"), JSON.stringify(pkg, null, 2));
  cpSync(path.join(REPO, "package.json"), path.join(fake, "package.json"));
  cpSync(path.join(REPO, "pnpm-workspace.yaml"), path.join(fake, "pnpm-workspace.yaml"));
  symlinkSync(path.join(REPO, "frontend"), path.join(fake, "frontend"));
  symlinkSync(path.join(REPO, "getwrite-config"), path.join(fake, "getwrite-config"));
  assertThrowaway(path.join(fake, "projects"));
};
buildFake();
const cleanEnv = () => {
  const env = { ...process.env };
  for (const k of ["DATABASE_URL", "BETTER_AUTH_SECRET", "GETWRITE_ENABLE_DEV_IDENTITY", "GETWRITE_BIND", "HOSTNAME", "GETWRITE_SHARING", "GETWRITE_WINDOW_SECRET", "GETWRITE_SHARING_DIR", "GETWRITE_PROJECTS_DIR", "ELECTRON_RUN_AS_NODE", "PORT"]) delete env[k];
  return env;
};
const strip = (s) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
const electronVersion = JSON.parse(readFileSync(path.join(REPO, "electron/node_modules/electron/package.json"), "utf8")).version;
say(`mode=${process.argv.slice(2).join(" ")} app-port=${APP_PORT} node=${process.version} electron=${electronVersion}; throwaway root under os.tmpdir() (name withheld), asserted not inside the owner's userData or log folder`);
say(`repo projects/ BEFORE: ${snapshotRepoProjects()}`);
say(`pre-check: listeners on ${APP_PORT}: none`);

const stopRecorded = async () => {
  let left = [...known.keys()].filter((p) => alive(p) && sameComm(p));
  say(`pids recorded: ${known.size}; still alive: ${left.length ? left.map((p) => `${p}(${known.get(p).comm})`).join(",") : "none"}`);
  for (const sig of ["SIGTERM", "SIGKILL"]) {
    if (left.length === 0) break;
    for (const p of left) {
      try {
        process.kill(p, sig);
      } catch {
        // already gone
      }
    }
    await sleep(3000);
    left = left.filter((p) => alive(p) && sameComm(p));
    say(`after ${sig} to those recorded pids: ${left.length ? left.join(",") : "none alive"}`);
  }
};
const finish = async () => {
  await stopRecorded();
  say(`listeners on ${APP_PORT} after stop: ${listenersOn(APP_PORT).map((l) => `${l.pid}(${l.comm})`).join(",") || "none"}`);
  say(`repo projects/ AFTER: ${snapshotRepoProjects()}`);
  rmSync(root, { recursive: true, force: true });
  rmSync(LOGDIR, { recursive: true, force: true });
  say(`throwaway root removed: ${!existsSync(root)}; throwaway log folder removed: ${!existsSync(LOGDIR)}`);
};
const printTree = (label) => {
  say(`--- ${label}: recorded process set (pid ppid comm; LISTEN rows from lsof -nP -iTCP -sTCP:LISTEN -a -p <pid>) ---`);
  for (const [pid, v] of [...known.entries()].sort((a, b) => a[0] - b[0])) {
    const rows = alive(pid) ? listenRowsForPid(pid) : [];
    say(`pid ${pid} ppid ${v.ppid} ${v.comm}${alive(pid) ? "" : " (gone)"}${rows.length ? `  LISTEN ${rows.map((r) => r.name).join(", ")}` : ""}`);
  }
};

// ---------------------------------------------------------- mode: cmd
async function runCmd() {
  const which = process.argv[3];
  const tree = process.argv[4] ?? "fake";
  if (!["dev", "start", "port"].includes(which) || !["fake", "repo"].includes(tree)) throw new Error("bad cmd args");
  const env = cleanEnv();
  env.GETWRITE_PROJECTS_DIR = PROJECTS_TMP;
  let cwd;
  let args;
  let wantPort = APP_PORT;
  if (which === "dev") {
    cwd = tree === "fake" ? path.join(fake, "frontend") : path.join(REPO, "frontend");
    args = ["dev"];
  } else if (which === "start") {
    cwd = tree === "fake" ? fake : REPO;
    args = ["start"];
  } else {
    wantPort = await freePort();
    if (wantPort === APP_PORT) throw new Error("picked 3000");
    env.PORT = String(wantPort);
    cwd = path.join(fake, "frontend");
    args = ["dev"];
  }
  say(`command: (cwd=${tree === "repo" ? "REPO" : "FAKE-TREE"}${which === "port" ? "/frontend" : ""}) pnpm ${args.join(" ")}  GETWRITE_PROJECTS_DIR=<throwaway> PORT=${env.PORT ?? "(unset)"} HOSTNAME=(unset)`);
  const out = [];
  const child = spawn("pnpm", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  known.set(child.pid, { comm: "pnpm", ppid: process.pid });
  say(`started pnpm pid=${child.pid}`);
  let exited = null;
  child.on("exit", (code, sig) => (exited = { code, sig }));
  for (const s of [child.stdout, child.stderr]) s.on("data", (d) => out.push(...strip(d.toString()).split("\n").filter(Boolean)));
  const t0 = Date.now();
  let found = false;
  while (Date.now() - t0 < 120_000 && exited === null) {
    recordTree(child.pid);
    for (const pid of known.keys()) if (alive(pid) && listenRowsForPid(pid).length) found = true;
    if (found) break;
    await sleep(500);
  }
  await sleep(3000);
  recordTree(child.pid);
  say(`listening socket found: ${found}; pnpm exited early: ${exited ? JSON.stringify(exited) : "no"}; after ${Date.now() - t0} ms`);
  printTree(`command ${which}`);
  say(`listeners on ${APP_PORT} now: ${listenersOn(APP_PORT).map((l) => `pid ${l.pid} (${l.comm}) ${l.name}`).join("; ") || "none"}`);
  if (wantPort !== APP_PORT) say(`listeners on the picked PORT ${wantPort} now: ${listenersOn(wantPort).map((l) => `pid ${l.pid} (${l.comm}) ${l.name}`).join("; ") || "none"}`);
  say("--- command output lines (first 25, each cut to 160 chars) ---");
  for (const l of out.slice(0, 25)) say(l.slice(0, 160));
  say(`(total output lines: ${out.length})`);
}

// ------------------------------------------------- Electron helpers
const ELECTRON_BIN = path.join(REPO, "electron/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const loadPlaywright = () => createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
const readLog = () => {
  try {
    return readFileSync(path.join(LOGDIR, "getwrite.log"), "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
};
const sampleWindows = async (app) => {
  try {
    return await app.evaluate(async ({ BrowserWindow }) => {
      const all = BrowserWindow.getAllWindows();
      const w = all[0];
      if (!w) return { windows: 0 };
      let text = "";
      try {
        text = String(await w.webContents.executeJavaScript("document.body ? document.body.innerText : ''")).slice(0, 300);
      } catch {
        text = "<unreadable>";
      }
      return { windows: all.length, url: w.webContents.getURL(), title: w.getTitle(), text, loading: w.webContents.isLoading() };
    });
  } catch (e) {
    return { error: errLine(e) };
  }
};
const describeWin = (s) => {
  if (s.error) return `evaluate failed (${s.error})`;
  if (!s.windows) return "no window";
  let shown = s.url;
  try {
    const u = new URL(s.url);
    shown = u.protocol === "data:" ? "data: page" : `${u.origin}${u.pathname}`;
  } catch {
    // keep raw
  }
  return `windows=${s.windows} ${shown}; title=${JSON.stringify(s.title)}; text=${JSON.stringify(String(s.text).replace(/\s+/g, " ").trim().slice(0, 120))}; loading=${s.loading}`;
};
const launchApp = async (_electron, userdata) => {
  mkdirSync(userdata);
  assertThrowaway(userdata);
  const app = await _electron.launch({
    executablePath: ELECTRON_BIN,
    args: [path.join(fake, "electron"), `--user-data-dir=${userdata}`],
    env: cleanEnv(),
    timeout: 120000,
  });
  return app;
};
const assertApp = async (app, userdata) => {
  const info = await app.evaluate(({ app: a }) => ({ ud: a.getPath("userData"), packaged: a.isPackaged, logs: a.getPath("logs"), lock: a.hasSingleInstanceLock() }));
  if (realpathSync(info.ud) !== realpathSync(userdata) || ownerDirs.some((o) => info.ud.startsWith(o))) throw new Error("userData is not the throwaway folder; stopping");
  if (info.logs !== LOGDIR) throw new Error("logs path is not the throwaway log folder; stopping");
  return info;
};
const waitLoaded = async (app, ms) => {
  const t0 = Date.now();
  let s = {};
  while (Date.now() - t0 < ms) {
    s = await sampleWindows(app);
    if (s.url && s.url.startsWith(`http://localhost:${APP_PORT}`) && !s.loading) return s;
    if (s.url && s.url.startsWith("data:")) return s;
    await sleep(1000);
  }
  return s;
};

// ---------------------------------------------------- mode: electron
async function runElectron() {
  const { _electron } = loadPlaywright();
  const ud = path.join(realRoot, "userdata-1");
  const app = await launchApp(_electron, ud);
  const pid = app.process().pid;
  known.set(pid, { comm: "electron-main", ppid: process.pid });
  say(`started electron pid=${pid}`);
  const info = await assertApp(app, ud);
  say(`asserted: userData is the throwaway folder; isPackaged=${info.packaged}; hasSingleInstanceLock=${info.lock}; logs folder is the throwaway one`);
  const s = await waitLoaded(app, 90_000);
  for (let i = 0; i < 8; i++) {
    recordTree(process.pid);
    await sleep(500);
  }
  say(`window: ${describeWin(s)}`);
  printTree("pnpm electron:dev equivalent (real Electron, dev code path, copied tree)");
  say(`listeners on ${APP_PORT}: ${listenersOn(APP_PORT).map((l) => `pid ${l.pid} (${l.comm}) ${l.name}`).join("; ") || "none"}`);
  say("--- the app's own log (names and messages only, first 25, each cut to 160 chars) ---");
  for (const l of readLog().slice(0, 25)) say(l.slice(0, 160));
  await Promise.race([app.close(), sleep(20000)]).catch((e) => say(`app.close: ${errLine(e)}`));
  await sleep(3000);
}

// -------------------------------------------------------- mode: two
async function runTwo() {
  const launcher = process.argv[3] ?? "pw";
  if (!["pw", "plain"].includes(launcher)) throw new Error("two takes pw or plain");
  const { _electron } = loadPlaywright();
  const ud1 = path.join(realRoot, "userdata-1");
  const SAME = process.argv[4] === "same";
  const ud2 = SAME ? ud1 : path.join(realRoot, "userdata-2");
  const app1 = await launchApp(_electron, ud1);
  const pid1 = app1.process().pid;
  known.set(pid1, { comm: "electron-main", ppid: process.pid });
  say(`started instance 1 pid=${pid1} (--user-data-dir = throwaway #1)`);
  const info1 = await assertApp(app1, ud1);
  say(`instance 1: isPackaged=${info1.packaged}; hasSingleInstanceLock=${info1.lock}`);
  const s1 = await waitLoaded(app1, 90_000);
  recordTree(process.pid);
  say(`instance 1 window before instance 2 starts: ${describeWin(s1)}`);
  const own1 = listenersOn(APP_PORT);
  say(`listeners on ${APP_PORT} before instance 2: ${own1.map((l) => `pid ${l.pid} (${l.comm}) ${l.name}`).join("; ") || "none"}`);
  const tree1 = new Set(known.keys());
  const logBefore = readLog().length;

  if (!SAME) mkdirSync(ud2);
  assertThrowaway(ud2);
  say(`instance 2 --user-data-dir is ${SAME ? "the SAME folder as instance 1 (control)" : "a DIFFERENT folder from instance 1"}`);
  let app2 = null;
  let exit2 = null;
  const out2 = [];
  const t2 = Date.now();
  if (launcher === "pw") {
    say(`starting instance 2 with Playwright _electron.launch (--user-data-dir = throwaway #2, different folder from #1)`);
    try {
      app2 = await _electron.launch({ executablePath: ELECTRON_BIN, args: [path.join(fake, "electron"), `--user-data-dir=${ud2}`], env: cleanEnv(), timeout: 60000 });
      known.set(app2.process().pid, { comm: "electron-main", ppid: process.pid });
      say(`instance 2 launched, pid=${app2.process().pid}`);
      app2.process().on("exit", (code, sig) => (exit2 = { t: Date.now() - t2, code, sig }));
    } catch (e) {
      say(`instance 2 launch failed after ${Date.now() - t2} ms; message (first line): ${errLine(e)}`);
    }
  } else {
    say(`starting instance 2 with plain spawn (--user-data-dir = throwaway #2, different folder from #1)`);
    const c = spawn(ELECTRON_BIN, [path.join(fake, "electron"), `--user-data-dir=${ud2}`], { env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"] });
    known.set(c.pid, { comm: "electron-main", ppid: process.pid });
    say(`instance 2 pid=${c.pid}`);
    c.on("exit", (code, sig) => (exit2 = { t: Date.now() - t2, code, sig }));
    for (const s of [c.stdout, c.stderr]) s.on("data", (d) => out2.push(...strip(d.toString()).split("\n").filter(Boolean)));
  }
  let s2 = null;
  for (let i = 0; i < 40; i++) {
    recordTree(process.pid);
    if (app2 && exit2 === null && i % 10 === 5) s2 = await sampleWindows(app2);
    await sleep(1000);
  }
  recordTree(process.pid);
  say(`instance 2 process exited: ${exit2 ? `yes, at ${exit2.t} ms, code ${exit2.code}, signal ${exit2.sig}` : "no, still running after 40 s"}`);
  if (s2) say(`instance 2 window (last sample): ${describeWin(s2)}`);
  if (out2.length) {
    say(`instance 2 stdout/stderr lines (first 15, cut to 160): `);
    for (const l of out2.slice(0, 15)) say(l.slice(0, 160));
  }
  say(`instance 1 window after: ${describeWin(await sampleWindows(app1))}`);
  const tail = readLog().slice(logBefore);
  say(`--- the shared throwaway log: lines written after instance 2 started (${tail.length}; first 30, cut to 160) ---`);
  for (const l of tail.slice(0, 30)) say(l.slice(0, 160));
  const now = listenersOn(APP_PORT);
  say(`listeners on ${APP_PORT} now: ${now.map((l) => `pid ${l.pid} (${l.comm}) ${l.name}${tree1.has(l.pid) ? " [recorded before instance 2 started]" : known.has(l.pid) ? " [recorded after instance 2 started]" : " [NOT in the recorded set]"}`).join("; ") || "none"}`);
  printTree("two-instance run");
  for (const [name, a] of [["instance 2", app2], ["instance 1", app1]]) {
    if (!a) continue;
    await Promise.race([a.close(), sleep(20000)]).catch((e) => say(`${name} close: ${errLine(e)}`));
  }
  await sleep(3000);
}

// -------------------------------------------------------------- run
try {
  if (MODE === "cmd") await runCmd();
  else if (MODE === "electron") await runElectron();
  else await runTwo();
} catch (e) {
  say(`script error: ${errLine(e)}`);
  process.exitCode = 1;
} finally {
  recordTree(process.pid);
  await finish();
}
