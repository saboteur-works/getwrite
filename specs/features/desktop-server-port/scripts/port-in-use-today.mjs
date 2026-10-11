#!/usr/bin/env node
/**
 * Feature 80, Task 3: what the UNCHANGED desktop app does when something
 * already listens on its port. Port used: 3000, because the constant in
 * electron/src/server-config.ts has not changed yet. Valid for the mechanism;
 * says nothing about 7340. (Tasks 17 and 19 repeat it on 7340 with a copy of
 * this approach.)
 *
 * Usage: node port-in-use-today.mjs <ok|500|silent> [listener-host]
 *   listener-host  address the throwaway listener binds: 127.0.0.1 (default),
 *                  0.0.0.0 or :: (dual-stack wildcard). Recorded in the output.
 *   ok      throwaway listener answers 200 with a marker page
 *   500     throwaway listener answers 500
 *   silent  throwaway listener accepts the request and never answers
 *
 * The listener is this same file started as a separate process with
 * `--listener <variant>`, so it has its own pid. It prints one JSON line per
 * request: time, method, path, a client kind (node-http when there is no
 * User-Agent, chromium otherwise) and whether the `x-getwrite-window` header
 * was PRESENT (true/false). It never reads, prints or stores the header value.
 *
 * App: the real Electron app in the development code path in a copied tree
 * (see specs/features/paired-device-limits/experiments.md, Desktop
 * verification): a throwaway fake repo root with a copy of electron/dist and
 * electron/package.json, symlinks to the real frontend/ and getwrite-config/,
 * and an empty projects/; Electron starts on <fake>/electron with a throwaway
 * --user-data-dir. The copied package.json gets a throwaway `name` so the
 * app's own log file (app.getPath("logs"), outside userData) goes to a
 * throwaway folder under ~/Library/Logs instead of the owner's log. Sharing is
 * left at its default (off).
 *
 * Needs electron/dist built (`pnpm build && pnpm build:worker` in electron/)
 * and @playwright/test (resolved from frontend/package.json). Run OUTSIDE the
 * command sandbox.
 *
 * Safety: refuses to run when anything listens on 3000 before the listener
 * starts. Starts only: the listener, the Electron app (and what it forks).
 * Stops only those pids (recorded while alive, descendants by parent pid),
 * never by port. Never touches ~/Library/Application Support/getwrite-electron.
 * Output carries no cookie, secret, window-secret value or pairing code.
 */
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import http from "node:http";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 3000;
const SELF = fileURLToPath(import.meta.url);
const MARKER = "FOREIGN-LISTENER-MARKER";

// ------------------------------------------------------------ listener mode
if (process.argv[2] === "--listener") {
  const variant = process.argv[3];
  const host = process.argv[4] ?? "127.0.0.1";
  const t0 = Date.now();
  const server = http.createServer((req, res) => {
    const ua = req.headers["user-agent"];
    console.log(
      JSON.stringify({
        t: Date.now() - t0,
        method: req.method,
        path: req.url,
        client: ua ? "chromium-like" : "node-http",
        windowHeaderPresent: "x-getwrite-window" in req.headers,
      }),
    );
    if (variant === "ok") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><title>${MARKER}</title><body>${MARKER}</body>`);
    } else if (variant === "500") {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("listener says 500");
    }
    // silent: no response, the connection stays open
  });
  server.on("error", (e) => console.log(JSON.stringify({ listenError: e.code })));
  server.listen(PORT, host, () => console.log(JSON.stringify({ listening: true })));
  process.on("SIGTERM", () => process.exit(0));
} else {
  await main();
}

// -------------------------------------------------------------------- main
async function main() {
  const VARIANT = process.argv[2];
  if (!["ok", "500", "silent"].includes(VARIANT)) {
    console.error("usage: port-in-use-today.mjs <ok|500|silent> [listener-host]");
    process.exit(2);
  }
  const HOST = process.argv[3] ?? "127.0.0.1";
  if (!["127.0.0.1", "0.0.0.0", "::"].includes(HOST)) throw new Error("listener-host must be 127.0.0.1, 0.0.0.0 or ::");
  const REPO = path.resolve(path.dirname(SELF), "../../../..");
  const nodeRequire = createRequire(path.join(REPO, "frontend/package.json"));
  const { _electron } = nodeRequire("@playwright/test");
  const ELECTRON_BIN = path.join(
    REPO,
    "electron/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
  );
  const OBSERVE_MS = 55_000;
  const say = (s) => console.log(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const lsofPids = () => {
    try {
      return execFileSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" })
        .split("\n")
        .filter(Boolean)
        .map(Number);
    } catch {
      return [];
    }
  };
  const lsofRows = () => {
    try {
      return execFileSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"], { encoding: "utf8" })
        .split("\n")
        .slice(1)
        .filter(Boolean)
        .map((l) => {
          const c = l.split(/\s+/);
          return `pid ${c[1]} (${c[0]}) ${c[c.length - 2]}`;
        });
    } catch {
      return [];
    }
  };
  if (lsofPids().length > 0) {
    console.error(`refusing to run: something listens on port ${PORT} before this script started anything`);
    process.exit(3);
  }

  const psTable = () =>
    execFileSync("ps", ["-A", "-o", "pid=,ppid=,comm="], { encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
      .filter(Boolean)
      .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), comm: path.basename(m[3]) }));
  const known = new Map(); // pid -> comm; only the pids this script started or their descendants
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
    for (const p of table) if (set.has(p.pid)) known.set(p.pid, p.comm);
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
    return row !== undefined && row.comm === known.get(pid);
  };

  // throwaway folders, asserted before anything is started
  const ownerDir = path.join(homedir(), "Library", "Application Support", "getwrite-electron");
  const root = mkdtempSync(path.join(tmpdir(), "gw-portuse-"));
  const realRoot = realpathSync(root);
  const assertThrowaway = (p) => {
    const real = realpathSync(p);
    if (!real.startsWith(realRoot) || real.startsWith(ownerDir)) throw new Error("path is not a throwaway path");
  };
  const USERDATA = path.join(realRoot, "userdata");
  const fake = path.join(realRoot, "repo");
  const PROJECTS = path.join(fake, "projects");
  const LOGNAME = `gw-portuse-throwaway-${path.basename(realRoot)}`;
  const LOGDIR = path.join(homedir(), "Library", "Logs", LOGNAME);
  mkdirSync(USERDATA);
  mkdirSync(path.join(fake, "electron"), { recursive: true });
  mkdirSync(PROJECTS);
  cpSync(path.join(REPO, "electron/dist"), path.join(fake, "electron/dist"), { recursive: true });
  const pkg = JSON.parse(readFileSync(path.join(REPO, "electron/package.json"), "utf8"));
  pkg.name = LOGNAME;
  delete pkg.productName;
  writeFileSync(path.join(fake, "electron/package.json"), JSON.stringify(pkg, null, 2));
  symlinkSync(path.join(REPO, "frontend"), path.join(fake, "frontend"));
  symlinkSync(path.join(REPO, "getwrite-config"), path.join(fake, "getwrite-config"));
  for (const p of [USERDATA, PROJECTS]) assertThrowaway(p);
  if (!existsSync(ELECTRON_BIN)) throw new Error("electron binary missing");
  say(`variant=${VARIANT} listener-host=${HOST} port=${PORT} node=${process.version}; throwaway root under os.tmpdir() (name withheld); asserted not inside the owner's userData`);

  let listener;
  const listenerLines = [];
  let app;
  const timeline = [];
  let exitedAt = null;
  const t0 = Date.now();
  const rel = () => Date.now() - t0;
  try {
    listener = spawn(process.execPath, [SELF, "--listener", VARIANT, HOST], { stdio: ["ignore", "pipe", "inherit"] });
    known.set(listener.pid, path.basename(process.execPath));
    say(`started listener pid=${listener.pid}`);
    listener.stdout.on("data", (d) => {
      for (const l of d.toString().split("\n").filter(Boolean)) listenerLines.push(l);
    });
    for (let i = 0; i < 40 && !listenerLines.some((l) => l.includes("listening")); i++) await sleep(100);
    const lis = lsofPids();
    say(`listeners on ${PORT} after the throwaway listener started: ${lsofRows().join("; ") || "none"} (must be only the listener pid)`);
    if (lis.length !== 1 || lis[0] !== listener.pid) throw new Error("the only listener on 3000 is not the throwaway listener; stopping");

    const env = { ...process.env };
    for (const k of ["DATABASE_URL", "BETTER_AUTH_SECRET", "GETWRITE_ENABLE_DEV_IDENTITY", "GETWRITE_BIND", "HOSTNAME", "GETWRITE_SHARING", "GETWRITE_WINDOW_SECRET", "GETWRITE_SHARING_DIR", "GETWRITE_PROJECTS_DIR", "ELECTRON_RUN_AS_NODE", "PORT"]) delete env[k];
    app = await _electron.launch({
      executablePath: ELECTRON_BIN,
      args: [path.join(fake, "electron"), `--user-data-dir=${USERDATA}`],
      env,
      timeout: 120000,
    });
    const pid = app.process().pid;
    known.set(pid, "electron-main");
    say(`started electron pid=${pid}`);
    app.process().on("exit", (code) => {
      exitedAt = { t: rel(), code };
    });
    const info = await app.evaluate(({ app: a }) => ({ ud: a.getPath("userData"), packaged: a.isPackaged, logs: a.getPath("logs") }));
    if (realpathSync(info.ud) !== USERDATA || info.ud.startsWith(ownerDir)) throw new Error("userData is not the throwaway folder; stopping");
    if (info.logs !== LOGDIR) throw new Error("logs path is not the throwaway log folder; stopping");
    say(`asserted: userData is the throwaway folder; isPackaged=${info.packaged}; logs folder is the throwaway one`);

    // sample the window
    const sample = async () => {
      try {
        return await app.evaluate(async ({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows()[0];
          if (!w) return { windows: 0 };
          const url = w.webContents.getURL();
          let text = "";
          try {
            text = String(await w.webContents.executeJavaScript("document.body ? document.body.innerText : ''")).slice(0, 400);
          } catch {
            text = "<unreadable>";
          }
          return { windows: BrowserWindow.getAllWindows().length, url, title: w.getTitle(), text, loading: w.webContents.isLoading() };
        });
      } catch (e) {
        return { error: e instanceof Error ? e.message.split("\n")[0] : "error" };
      }
    };
    const kind = (s) => {
      if (s.error) return `evaluate failed (${s.error})`;
      if (!s.windows) return "no window";
      if (!s.url) return "blank (no url)";
      if (s.url.startsWith("data:")) return `data: page; text=${JSON.stringify(s.text.replace(/\s+/g, " ").trim())}`;
      let u;
      try {
        u = new URL(s.url);
      } catch {
        return "unparseable url";
      }
      return `${u.origin}${u.pathname}; title=${JSON.stringify(s.title)}; text=${JSON.stringify(s.text.replace(/\s+/g, " ").trim().slice(0, 120))}`;
    };
    let last = null;
    let statusAtForeign = null;
    const readStatus = async () => {
      try {
        return await app.evaluate(async ({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows()[0];
          if (!w) return { error: "no window" };
          const s = await w.webContents.executeJavaScript(
            "window.getwriteDesktop && window.getwriteDesktop.getSharingStatus ? window.getwriteDesktop.getSharingStatus().then(function(x){return {enabled:x.enabled,effective:x.effective,blockedByHostedAuth:x.blockedByHostedAuth,port:x.port,addressCount:x.addresses.length,credentialStore:x.credentialStore}}, function(e){return {rejected:String(e && e.message || e).slice(0,200)}}) : {bridge:'absent'}",
          );
          return s;
        });
      } catch (e) {
        return { error: e instanceof Error ? e.message.split("\n")[0] : "error" };
      }
    };
    while (rel() < OBSERVE_MS && exitedAt === null) {
      recordTree(pid);
      const s = await sample();
      const k = kind(s);
      if (k !== last) {
        timeline.push({ t: rel(), k });
        last = k;
        if (statusAtForeign === null && k.includes(MARKER)) statusAtForeign = await readStatus();
      }
      await sleep(1000);
    }
    const final = await sample();
    const finalStatus = await readStatus();
    recordTree(pid);

    say("--- window timeline (ms since launch start; only changes are listed) ---");
    for (const e of timeline) say(`t=${e.t}: ${e.k}`);
    say(`window at end: ${kind(final)}`);
    say(`sharing status read through the window's bridge while it showed the foreign page: ${statusAtForeign ? JSON.stringify(statusAtForeign) : "not read (the window never showed the foreign page)"}`);
    say(`sharing status read at the end: ${JSON.stringify(finalStatus)}`);
    say(`app process exited during the ${OBSERVE_MS / 1000} s observation: ${exitedAt ? `yes (t=${exitedAt.t}, code ${exitedAt.code})` : "no"}`);
    say(`listeners on ${PORT} at the end: ${lsofRows().join("; ") || "none"}`);
    const lerr = listenerLines.filter((l) => l.includes("listenError"));
    if (lerr.length) say(`throwaway listener bind error lines: ${lerr.join(" ")}`);
    const reqs = listenerLines.filter((l) => l.startsWith("{") && l.includes("windowHeaderPresent")).map((l) => JSON.parse(l));
    const by = (c) => reqs.filter((r) => r.client === c);
    say(`listener requests: ${reqs.length}; node-http (main-process readiness): ${by("node-http").length}, of which header present: ${by("node-http").filter((r) => r.windowHeaderPresent).length}; chromium-like (window): ${by("chromium-like").length}, of which header present: ${by("chromium-like").filter((r) => r.windowHeaderPresent).length}`);
    say(`listener first requests: ${reqs.slice(0, 4).map((r) => `${r.t}ms ${r.method} ${r.path} ${r.client} header=${r.windowHeaderPresent ? "yes" : "no"}`).join(" | ")}`);
    say(`listener last request: ${reqs.length ? `${reqs[reqs.length - 1].t}ms` : "none"}`);
    let logText = "";
    try {
      logText = readFileSync(path.join(LOGDIR, "getwrite.log"), "utf8");
    } catch {
      logText = "";
    }
    const logLines = logText.split("\n").filter(Boolean);
    say(`--- the app's own log file in the throwaway log folder (${logLines.length} lines; first 60 shown, each cut to 200 chars) ---`);
    for (const l of logLines.slice(0, 60)) say(l.slice(0, 200));
    const exitLine = logLines.filter((l) => /server exited with code/.test(l));
    say(`forked server exit line(s): ${exitLine.length ? exitLine.join(" || ") : "none in the observation window"}`);
    say(`descendant pids recorded under the electron pid: ${[...known.keys()].filter((p) => p !== listener.pid).length}`);
  } catch (e) {
    say(`script error: ${e instanceof Error ? e.message.split("\n")[0] : "unknown"}`);
    process.exitCode = 1;
  } finally {
    const appPid = app?.process().pid;
    if (appPid !== undefined) {
      try {
        recordTree(appPid);
        await Promise.race([app.close(), sleep(20000)]);
      } catch (e) {
        say(`app.close: ${e instanceof Error ? e.message.split("\n")[0] : "error"}`);
      }
      await sleep(4000);
    }
    let left = [...known.keys()].filter((p) => alive(p) && sameComm(p));
    say(`pids recorded (listener + electron + descendants): ${known.size}; still alive after app close: ${left.length ? left.map((p) => `${p}(${known.get(p)})`).join(",") : "none"}`);
    for (const sig of ["SIGTERM", "SIGKILL"]) {
      if (left.length === 0) break;
      for (const p of left) {
        try {
          process.kill(p, sig);
        } catch {
          // gone
        }
      }
      await sleep(3000);
      left = left.filter((p) => alive(p) && sameComm(p));
      say(`after ${sig} to those recorded pids: ${left.length ? left.join(",") : "none alive"}`);
    }
    say(`listener(s) on ${PORT} after stop: ${lsofPids().join(",") || "none"}`);
    rmSync(root, { recursive: true, force: true });
    rmSync(LOGDIR, { recursive: true, force: true });
    say(`throwaway root removed: ${!existsSync(root)}; throwaway log folder removed: ${!existsSync(LOGDIR)}`);
  }
}
