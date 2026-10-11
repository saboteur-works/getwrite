#!/usr/bin/env node
/**
 * Feature 80, Task 17: the real Electron app in development mode on 7340.
 *
 * Usage: node electron-dev-7340.mjs [phases]   phases: comma list of
 *   off,on,blocked (default: all). Run OUTSIDE the command sandbox.
 *
 * Dev code path in a copied tree: a throwaway fake repo root with a copy of
 * electron/dist and electron/package.json (throwaway package `name`, no
 * `productName`, so app.getPath("logs") is a throwaway folder under
 * ~/Library/Logs), symlinks to the real frontend/ and getwrite-config/, an
 * empty projects/. Every launch has its own throwaway --user-data-dir. Sharing
 * ON is SEEDED in the throwaway workspace.json (a restart cannot be driven).
 *
 * Phases
 *   off      sharing OFF: loaded origin, listening port by pid, nothing of the
 *            app on 3000.
 *   on       sharing ON: loaded origin, displayed addresses (Start Page status
 *            and App Settings sections, as shown text), Host allowlist from
 *            the host, nothing of the app on 3000.
 *   blocked  a throwaway listener answering 200 with a marker page on 7340,
 *            once per shape (127.0.0.1 only; 0.0.0.0; ::1 only when the host
 *            has ::1). The app is launched against it, observed ~20 s, and
 *            stopped; 7340 is confirmed free; a fresh normal launch follows.
 *
 * The listener is this same file started as a separate process
 * (`--listener <host>`), own pid. It logs per request: path (query values
 * stripped), the NAMES of query parameters, whether `x-getwrite-window` was
 * present (never the value) and the names of any non-standard headers.
 *
 * Safety: refuses to run when anything listens on 7340, 3000 or 6006. Stops
 * only pids it recorded (the pids it started and their descendants), after a
 * command-name match, never by port or name. Never touches
 * ~/Library/Application Support/getwrite-electron or ~/Library/Logs/getwrite-electron.
 * Prints no cookie, secret, key, proof, code or response body.
 */
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
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
import { homedir, networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 7340;
const SELF = fileURLToPath(import.meta.url);
const MARKER = "FOREIGN-LISTENER-MARKER-7340";

// ------------------------------------------------------------ listener mode
if (process.argv[2] === "--listener") {
  const host = process.argv[3];
  const t0 = Date.now();
  const STANDARD = new Set([
    "host", "connection", "accept", "accept-encoding", "accept-language", "user-agent", "upgrade-insecure-requests",
    "cache-control", "pragma", "content-length", "content-type", "origin", "referer", "dnt", "priority", "if-none-match",
    "if-modified-since", "range", "te", "keep-alive",
  ]);
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const names = Object.keys(req.headers);
    console.log(
      JSON.stringify({
        t: Date.now() - t0,
        method: req.method,
        path: u.pathname,
        queryNames: [...u.searchParams.keys()],
        client: req.headers["user-agent"] ? "chromium-like" : "node-http",
        windowHeaderPresent: "x-getwrite-window" in req.headers,
        otherHeaderNames: names.filter((n) => !STANDARD.has(n) && !n.startsWith("sec-") && n !== "x-getwrite-window"),
        readinessLikeNames: names.filter((n) => /getwrite|readiness|challenge|proof|key|secret|token|auth/i.test(n)),
      }),
    );
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><title>${MARKER}</title><body>${MARKER}</body>`);
  });
  server.on("error", (e) => console.log(JSON.stringify({ listenError: e.code })));
  server.listen(PORT, host, () => console.log(JSON.stringify({ listening: true })));
  process.on("SIGTERM", () => process.exit(0));
} else {
  await main();
}

// -------------------------------------------------------------------- main
async function main() {
  const wanted = new Set((process.argv[2] ?? "off,on,blocked").split(","));
  const REPO = path.resolve(path.dirname(SELF), "../../../..");
  const say = (s) => console.log(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const errLine = (e) => (e instanceof Error ? e.message.split("\n")[0] : String(e));
  const lsof = (args) => {
    try {
      return execFileSync("lsof", args, { encoding: "utf8" });
    } catch {
      return "";
    }
  };
  const listeners = (port) =>
    lsof(["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]).split("\n").slice(1).filter(Boolean).map((l) => {
      const c = l.split(/\s+/);
      return { pid: Number(c[1]), cmd: c[0], addr: c[c.length - 2] };
    });
  const fmt = (ls) => ls.map((l) => `${l.pid}(${l.cmd}) ${l.addr}`).join("; ") || "none";
  const psTable = () =>
    execFileSync("ps", ["-A", "-o", "pid=,ppid=,comm="], { encoding: "utf8" })
      .split("\n").map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
      .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), comm: path.basename(m[3]) }));
  const known = new Map(); // pid -> comm: only pids this script started or their descendants
  const recordTree = (rootPid, bucket) => {
    const table = psTable();
    const set = new Set([rootPid]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const p of table) if (set.has(p.ppid) && !set.has(p.pid)) { set.add(p.pid); grew = true; }
    }
    for (const p of table) if (set.has(p.pid) && p.pid !== process.pid) { known.set(p.pid, p.comm); bucket?.add(p.pid); }
    return [...set];
  };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
  const sameComm = (pid) => psTable().find((p) => p.pid === pid)?.comm === known.get(pid);
  const stopRecorded = async (label, pids) => {
    let left = pids.filter((p) => alive(p) && sameComm(p));
    say(`[${label}] recorded pids: ${pids.length}; still alive after app/listener stop: ${left.map((p) => `${p}(${known.get(p)})`).join(",") || "none"}`);
    for (const sig of ["SIGTERM", "SIGKILL"]) {
      if (!left.length) break;
      for (const p of left) { try { process.kill(p, sig); } catch {} }
      await sleep(3000);
      left = left.filter((p) => alive(p) && sameComm(p));
      say(`[${label}] after ${sig} to recorded pids: ${left.join(",") || "none alive"}`);
    }
  };

  for (const port of [PORT, 3000, 6006]) {
    const l = listeners(port);
    if (l.length) { console.error(`refusing: something listens on ${port}: ${fmt(l)}`); process.exit(3); }
  }
  const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address))?.address;
  if (!lan) { console.error("no private IPv4 address"); process.exit(4); }
  const mask = (s) => String(s).split(lan).join("<lan-ip>");
  const hasIPv6Loopback = Object.values(networkInterfaces()).flat().some((i) => i && i.family === "IPv6" && i.address === "::1");

  const ownerDirs = [path.join(homedir(), "Library", "Application Support", "getwrite-electron"), path.join(homedir(), "Library", "Logs", "getwrite-electron")];
  const root = mkdtempSync(path.join(tmpdir(), "gw-dev7340-"));
  const realRoot = realpathSync(root);
  const LOGNAME = `gw-dev7340-throwaway-${path.basename(realRoot)}`;
  const LOGDIR = path.join(homedir(), "Library", "Logs", LOGNAME);
  const fake = path.join(realRoot, "repo");
  const PROJECTS = path.join(fake, "projects");
  mkdirSync(path.join(fake, "electron"), { recursive: true });
  mkdirSync(PROJECTS);
  cpSync(path.join(REPO, "electron/dist"), path.join(fake, "electron/dist"), { recursive: true });
  const pkg = JSON.parse(readFileSync(path.join(REPO, "electron/package.json"), "utf8"));
  pkg.name = LOGNAME;
  delete pkg.productName;
  writeFileSync(path.join(fake, "electron/package.json"), JSON.stringify(pkg, null, 2));
  cpSync(path.join(REPO, "package.json"), path.join(fake, "package.json"));
  cpSync(path.join(REPO, "pnpm-workspace.yaml"), path.join(fake, "pnpm-workspace.yaml"));
  symlinkSync(path.join(REPO, "frontend"), path.join(fake, "frontend"));
  symlinkSync(path.join(REPO, "getwrite-config"), path.join(fake, "getwrite-config"));
  const underOwner = (p) => ownerDirs.some((o) => p.startsWith(o));
  if (!realpathSync(PROJECTS).startsWith(realRoot) || underOwner(realpathSync(PROJECTS)) || underOwner(LOGDIR)) { console.error("path not throwaway"); process.exit(5); }

  const { _electron } = createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
  const ELECTRON_BIN = path.join(REPO, "electron/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
  const env = { ...process.env };
  for (const k of ["DATABASE_URL", "BETTER_AUTH_SECRET", "GETWRITE_ENABLE_DEV_IDENTITY", "GETWRITE_BIND", "HOSTNAME", "GETWRITE_SHARING", "GETWRITE_WINDOW_SECRET", "GETWRITE_SHARING_DIR", "GETWRITE_PROJECTS_DIR", "ELECTRON_RUN_AS_NODE", "PORT"]) delete env[k];

  const results = [];
  const check = (name, ok, detail = "") => { results.push(ok); say(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` -- ${detail}` : ""}`); };
  const allPids = [];
  let launchNo = 0;
  let logLinesSeen = 0;
  const readLog = () => {
    try { return readFileSync(path.join(LOGDIR, "getwrite.log"), "utf8").split("\n").filter(Boolean); } catch { return []; }
  };
  const newLogLines = () => {
    const all = readLog();
    const fresh = all.slice(logLinesSeen);
    logLinesSeen = all.length;
    return fresh;
  };
  const showLog = (lines) => {
    for (const l of lines.slice(0, 40)) say(`    log: ${/secret|readiness.?key|proof|cookie|challenge=/i.test(l) ? "[line withheld: matches a secret-like word]" : mask(l).slice(0, 200)}`);
    if (lines.length > 40) say(`    log: ... ${lines.length - 40} more lines`);
  };

  /** Launches the app with its own throwaway userData. Asserts paths before anything else is done. */
  async function launch(label, sharing) {
    launchNo += 1;
    const USERDATA = path.join(realRoot, `userdata-${launchNo}`);
    mkdirSync(USERDATA);
    if (sharing) writeFileSync(path.join(USERDATA, "workspace.json"), `${JSON.stringify({ sharingEnabled: true }, null, 2)}\n`);
    if (!realpathSync(USERDATA).startsWith(realRoot) || underOwner(realpathSync(USERDATA))) throw new Error("userData not throwaway; stopping");
    const app = await _electron.launch({ executablePath: ELECTRON_BIN, args: [path.join(fake, "electron"), `--user-data-dir=${USERDATA}`], env, timeout: 300000 });
    const pid = app.process().pid;
    known.set(pid, "electron-main");
    allPids.push(pid);
    const ctx = { app, pid, USERDATA, label, exitedAt: null, t0: Date.now(), seen: new Set([pid]) };
    app.process().on("exit", (code) => { ctx.exitedAt = { t: Date.now() - ctx.t0, code }; });
    const info = await app.evaluate(({ app: a }) => ({ ud: a.getPath("userData"), logs: a.getPath("logs"), packaged: a.isPackaged }));
    if (realpathSync(info.ud) !== USERDATA || underOwner(info.ud) || info.logs !== LOGDIR || info.packaged !== false) {
      await app.close().catch(() => {});
      throw new Error("userData/logs/isPackaged assertion failed; stopping");
    }
    say(`[${label}] started electron pid=${pid}; asserted: userData is the throwaway folder, logs folder is the throwaway one, isPackaged=${info.packaged}, sharing seeded ${sharing ? "ON" : "OFF (default)"}`);
    return ctx;
  }

  async function stopApp(ctx) {
    try { recordTree(ctx.pid, ctx.seen); } catch {}
    try { await Promise.race([ctx.app.close(), sleep(20000)]); } catch (e) { say(`[${ctx.label}] app.close: ${errLine(e)}`); }
    await sleep(3000);
    await stopRecorded(ctx.label, [...ctx.seen].filter((p) => alive(p)));
  }

  const windowState = async (app) => {
    try {
      return await app.evaluate(async ({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        if (!w) return { windows: 0 };
        let text = "";
        try { text = String(await w.webContents.executeJavaScript("document.body ? document.body.innerText : ''")); } catch { text = "<unreadable>"; }
        return { windows: BrowserWindow.getAllWindows().length, url: w.webContents.getURL(), title: w.getTitle(), text };
      });
    } catch (e) {
      return { error: errLine(e) };
    }
  };
  const bridgeStatus = async (app) => {
    try {
      return await app.evaluate(async ({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        if (!w) return { error: "no window" };
        return await w.webContents.executeJavaScript(
          "window.getwriteDesktop && window.getwriteDesktop.getSharingStatus ? window.getwriteDesktop.getSharingStatus().then(function(x){return {enabled:x.enabled,effective:x.effective,blockedByHostedAuth:x.blockedByHostedAuth,port:x.port,addresses:x.addresses,credentialStore:x.credentialStore}}, function(e){return {rejected:String(e && e.message || e).slice(0,200)}}) : {bridge:'absent'}",
        );
      });
    } catch (e) {
      return { error: errLine(e) };
    }
  };
  const tcpTry = (host, port) =>
    new Promise((resolve) => {
      const s = net.connect({ host, port, timeout: 3000 });
      s.once("connect", () => { s.destroy(); resolve("connected"); });
      s.once("timeout", () => { s.destroy(); resolve("timeout"); });
      s.once("error", (e) => resolve(e.code ?? "error"));
    });
  const hostReq = (hostHeader, urlPath = "/pair") =>
    new Promise((resolve) => {
      const r = http.request({ host: lan, port: PORT, path: urlPath, method: "GET", headers: { Host: hostHeader }, timeout: 10000 }, (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode, gate: res.headers["x-getwrite-gate"] ? "present" : "absent" }));
      });
      r.on("error", (e) => resolve({ error: e.code ?? errLine(e) }));
      r.on("timeout", () => { r.destroy(); resolve({ error: "timeout" }); });
      r.end();
    });

  /** Origin, listening port by pid, nothing on 3000. Returns the ctx still running. */
  async function normalChecks(label, sharing) {
    const ctx = await launch(label, sharing);
    const { app } = ctx;
    const win = await app.firstWindow();
    await win.waitForURL(/^http:\/\/localhost:7340\//, { timeout: 300000 });
    await win.getByRole("button", { name: "App Settings", exact: true }).waitFor({ timeout: 300000 });
    const origin = new URL(win.url()).origin;
    check(`[${label}] window's loaded origin is http://localhost:7340`, origin === "http://localhost:7340", origin);
    const tree = recordTree(ctx.pid, ctx.seen);
    const rows = lsof(["-nP", "-a", "-iTCP", "-sTCP:LISTEN", "-p", tree.join(",")]).split("\n").slice(1).filter(Boolean).map((l) => {
      const c = l.split(/\s+/);
      return { pid: Number(c[1]), cmd: c[0], addr: c[c.length - 2] };
    });
    say(`[${label}] listening sockets of the recorded pids (lsof -a -p <pids>): ${fmt(rows)}`);
    const on7340 = listeners(PORT);
    say(`[${label}] all listeners on ${PORT}: ${fmt(on7340)}`);
    check(`[${label}] the listener on ${PORT} is a recorded pid`, on7340.length > 0 && on7340.every((l) => tree.includes(l.pid)));
    say(`[${label}] recorded tree commands: ${tree.map((p) => `${p}(${known.get(p)})`).join(", ")}`);
    const l3000 = listeners(3000);
    say(`[${label}] listeners on 3000: ${fmt(l3000)}`);
    check(`[${label}] no listener on 3000 while the app runs`, l3000.length === 0);
    const tries = [`localhost->127.0.0.1:${await tcpTry("127.0.0.1", 3000)}`, `::1:${await tcpTry("::1", 3000)}`, `<lan-ip>:${await tcpTry(lan, 3000)}`];
    say(`[${label}] TCP connect to port 3000 (no listener existed to answer): ${tries.join(", ")}`);
    let fetchRes;
    try { const r = await fetch("http://localhost:3000/", { signal: AbortSignal.timeout(5000) }); fetchRes = `HTTP ${r.status}`; } catch (e) { fetchRes = `no response (${e.cause?.code ?? errLine(e)})`; }
    say(`[${label}] GET http://localhost:3000/ from this host: ${fetchRes}`);
    check(`[${label}] nothing of the app answers on 3000`, /no response/.test(fetchRes));
    return { ctx, win };
  }

  say(`node=${process.version}; date=${new Date().toISOString()}; pre-checks: no listener on 7340, 3000, 6006; lan address is a private IPv4 (value masked as <lan-ip>); host has ::1 on lo0: ${hasIPv6Loopback}`);
  say("everything ran outside the command sandbox; dev code path in a copied tree; sharing ON is seeded in the throwaway workspace.json (a restart cannot be driven)");

  const finish = async () => {
    rmSync(root, { recursive: true, force: true });
    rmSync(LOGDIR, { recursive: true, force: true });
    say(`final: listeners on ${PORT}: ${fmt(listeners(PORT))}; on 3000: ${fmt(listeners(3000))}; on 6006: ${fmt(listeners(6006))}`);
    say(`throwaway root removed: ${!existsSync(root)}; log folder removed: ${!existsSync(LOGDIR)}`);
    say(`checks: ${results.filter(Boolean).length}/${results.length} passed`);
  };

  try {
    if (wanted.has("off")) {
      say("=== PHASE off: sharing OFF ===");
      const { ctx } = await normalChecks("off", false);
      const st = await bridgeStatus(ctx.app);
      say(`[off] sharing status via the window's bridge: ${JSON.stringify({ ...st, addresses: Array.isArray(st.addresses) ? `${st.addresses.length} addresses` : st.addresses })}`);
      showLog(newLogLines());
      await stopApp(ctx);
      say(`[off] listeners on ${PORT} after stop: ${fmt(listeners(PORT))}`);
      check("[off] 7340 free after stop", listeners(PORT).length === 0);
    }

    if (wanted.has("on")) {
      say("=== PHASE on: sharing ON (seeded) ===");
      const { ctx, win } = await normalChecks("on", true);
      const st = await bridgeStatus(ctx.app);
      say(`[on] sharing status via the window's bridge: enabled=${st.enabled} effective=${st.effective} port=${st.port} credentialStore=${st.credentialStore} addresses(count)=${st.addresses?.length}`);
      // Start Page status surface, as shown text
      const isUrl = (t) => /^https?:\/\//.test(t.trim());
      const startSections = await win.locator('section[aria-label="Sharing is on"]').count();
      const startAll = await win.locator('section[aria-label="Sharing is on"] li').allInnerTexts();
      const startItems = startAll.filter(isUrl);
      say(`[on] Start Page status surface: ${startSections} section(s) labelled "Sharing is on"; list items inside: ${startAll.length}; address items (shown text, masked): ${startItems.map((t) => mask(t.trim())).join(" | ") || "none"}`);
      await win.getByRole("button", { name: "App Settings", exact: true }).click();
      await win.getByLabel("Home network sharing").getByText("Sharing is on", { exact: true }).waitFor({ timeout: 60000 });
      await sleep(1000);
      const settingsAll = await win.getByLabel("Home network sharing").locator("li").allInnerTexts();
      const settingsItems = settingsAll.filter(isUrl);
      say(`[on] App Settings "Home network sharing" section: list items inside: ${settingsAll.length} (${settingsAll.length - settingsItems.length} are not addresses: the limit toggles' own items); address items (shown text, masked): ${settingsItems.map((t) => mask(t.trim())).join(" | ") || "none"}`);
      const shown = [...startItems, ...settingsItems].map((t) => t.trim());
      const n7340 = shown.filter((t) => t.endsWith(":7340")).length;
      const n3000 = shown.filter((t) => t.endsWith(":3000")).length;
      say(`[on] shown address items: ${shown.length} (Start Page ${startItems.length}, App Settings ${settingsItems.length}); ending :7340: ${n7340}; ending :3000: ${n3000}; ending neither: ${shown.length - n7340 - n3000}; addresses reported by the bridge: ${st.addresses?.length}`);
      check("[on] every shown address ends in :7340 and none in :3000, at least one shown", shown.length > 0 && n7340 === shown.length && n3000 === 0);
      // Host allowlist: sent from the host to its own LAN address, NOT a second device
      const ok = await hostReq(`${lan}:${PORT}`);
      const bad = await hostReq(`${lan}:3000`);
      const ctl = await hostReq(`evil.example:${PORT}`);
      say(`[on] Host allowlist, GET /pair sent from this host to <lan-ip>:7340 (NOT a second-device result): Host <lan-ip>:7340 -> ${JSON.stringify(ok)}; Host <lan-ip>:3000 -> ${JSON.stringify(bad)}; control Host evil.example:7340 -> ${JSON.stringify(ctl)}`);
      check("[on] Host <lan-ip>:7340 accepted (200)", ok.status === 200);
      check("[on] Host <lan-ip>:3000 refused (403)", bad.status === 403);
      showLog(newLogLines());
      await stopApp(ctx);
      say(`[on] listeners on ${PORT} after stop: ${fmt(listeners(PORT))}`);
      check("[on] 7340 free after stop", listeners(PORT).length === 0);
    }

    if (wanted.has("blocked")) {
      const shapes = [["127.0.0.1", "127.0.0.1 only"], ["0.0.0.0", "all interfaces (0.0.0.0)"]];
      if (hasIPv6Loopback) shapes.push(["::1", "::1 only"]);
      else say("[blocked] ::1 listener: not run (no ::1 on this host)");
      for (const [host, desc] of shapes) {
        const label = `blocked ${host}`;
        say(`=== PHASE blocked: throwaway listener on 7340, ${desc} ===`);
        check(`[${label}] 7340 free before the listener starts`, listeners(PORT).length === 0);
        const lines = [];
        const listener = spawn(process.execPath, [SELF, "--listener", host], { stdio: ["ignore", "pipe", "inherit"] });
        known.set(listener.pid, path.basename(process.execPath));
        allPids.push(listener.pid);
        say(`[${label}] started listener pid=${listener.pid}`);
        listener.stdout.on("data", (d) => { for (const l of d.toString().split("\n").filter(Boolean)) lines.push(l); });
        for (let i = 0; i < 50 && !lines.some((l) => l.includes("listening") || l.includes("listenError")); i++) await sleep(100);
        const lis = listeners(PORT);
        say(`[${label}] listeners on ${PORT} after the listener started: ${fmt(lis)}`);
        let ctx;
        try {
          if (lis.length !== 1 || lis[0].pid !== listener.pid) throw new Error("the only listener on 7340 is not the throwaway listener; stopping");
          // 200 marker page check from the host, independent of the app (before the app starts is a request the listener logs too)
          ctx = await launch(label, false);
          const timeline = [];
          let last = "";
          let windowEverLocalOrigin = false;
          let windowEverMarker = false;
          let sawData = false;
          let finalState = {};
          const t0 = Date.now();
          while (Date.now() - t0 < 20000 && ctx.exitedAt === null) {
            const s = await windowState(ctx.app);
            finalState = s;
            let k;
            if (s.error) k = `evaluate failed (${s.error})`;
            else if (!s.windows) k = "no window";
            else if (!s.url) k = "blank";
            else if (s.url.startsWith("data:")) { k = "data: page"; sawData = true; }
            else {
              k = `${s.url.slice(0, 60)} title=${JSON.stringify(s.title)}`;
              if (/localhost:7340|127\.0\.0\.1:7340/.test(s.url) && !s.url.includes(MARKER)) windowEverLocalOrigin = true;
            }
            if (s.text && s.text.includes(MARKER)) windowEverMarker = true;
            if (s.title && s.title.includes(MARKER)) windowEverMarker = true;
            if (k !== last) { timeline.push(`t=${Date.now() - t0}ms ${k}`); last = k; }
            await sleep(400);
          }
          recordTree(ctx.pid, ctx.seen);
          say(`[${label}] window timeline (changes only, 400 ms sampling):`);
          for (const t of timeline) say(`    ${t}`);
          const text = (finalState.text ?? "").replace(/\s+/g, " ").trim();
          say(`[${label}] window at end: url kind=${finalState.url?.startsWith("data:") ? "data:" : finalState.url ?? "none"}; title=${JSON.stringify(finalState.title)}; text=${JSON.stringify(text.slice(0, 700))}`);
          check(`[${label}] window showed a data: page (not an http page) and never the listener's marker (text/title)`, sawData && !windowEverMarker);
          check(`[${label}] window's URL was never the local origin in any sample`, !windowEverLocalOrigin);
          check(`[${label}] message names 7340`, /7340/.test(text), "text contains '7340'");
          check(`[${label}] message is the port-in-use wording`, /did not start\. Port 7340 is already in use/.test(text));
          const st = await bridgeStatus(ctx.app);
          say(`[${label}] sharing status via the window's bridge (window is on a data: page): ${JSON.stringify({ ...st, addresses: Array.isArray(st.addresses) ? `${st.addresses.length} addresses` : st.addresses })}`);
          say(`[${label}] app process exited during the observation: ${ctx.exitedAt ? `yes (t=${ctx.exitedAt.t} ms, code ${ctx.exitedAt.code})` : "no"}`);
          const tree = recordTree(ctx.pid, ctx.seen);
          const treeCmds = tree.map((p) => `${p}(${known.get(p)})`);
          say(`[${label}] recorded tree under the electron pid (${tree.length}): ${treeCmds.join(", ")}`);
          const forkish = tree.filter((p) => /^(node|sh|zsh|bash|pnpm|next-server.*)$/.test(known.get(p) ?? ""));
          check(`[${label}] no server child forked (no node/sh/pnpm/next-server in the app's tree)`, forkish.length === 0, forkish.length ? forkish.map((p) => `${p}(${known.get(p)})`).join(",") : "");
          const nowLis = listeners(PORT);
          say(`[${label}] listeners on ${PORT} now: ${fmt(nowLis)}`);
          check(`[${label}] the only listener on 7340 is still the throwaway listener`, nowLis.length === 1 && nowLis[0].pid === listener.pid);
          const reqs = lines.filter((l) => l.startsWith("{") && l.includes("windowHeaderPresent")).map((l) => JSON.parse(l));
          say(`[${label}] listener received ${reqs.length} request(s); x-getwrite-window present on ${reqs.filter((r) => r.windowHeaderPresent).length} of them`);
          for (const r of reqs.slice(0, 10)) {
            say(`    ${r.t}ms ${r.method} ${r.path} query-param-names=[${r.queryNames.join(",")}] client=${r.client} window-header=${r.windowHeaderPresent ? "present" : "absent"} other-nonstandard-header-names=[${r.otherHeaderNames.join(",")}] readiness-like-header-names=[${r.readinessLikeNames.join(",")}]`);
          }
          check(`[${label}] the listener never received x-getwrite-window`, reqs.every((r) => !r.windowHeaderPresent));
          const fresh = newLogLines();
          say(`[${label}] the app's own log lines for this launch (${fresh.length}):`);
          showLog(fresh);
          check(`[${label}] log has no 'server ready' and no 'server exited' line`, !fresh.some((l) => /server ready|server exited/.test(l)));
          const entries = (await import("node:fs")).readdirSync(PROJECTS);
          check(`[${label}] the throwaway projects folder is still empty and the app logged no projectsDir line (nothing resolved or written)`, entries.length === 0 && !fresh.some((l) => /projectsDir/.test(l)), `entries ${entries.length}`);
        } finally {
          if (ctx) await stopApp(ctx);
          try { process.kill(listener.pid, "SIGTERM"); } catch {}
          await sleep(1500);
          const left = alive(listener.pid) && sameComm(listener.pid);
          say(`[${label}] listener pid ${listener.pid} still alive after SIGTERM: ${left}`);
          if (left) { try { process.kill(listener.pid, "SIGKILL"); } catch {} await sleep(1000); }
        }
        check(`[${label}] 7340 free after the listener and app were stopped`, listeners(PORT).length === 0, fmt(listeners(PORT)));
        // fresh normal launch with the listener gone
        const { ctx: c2 } = await normalChecks(`after ${host}`, false);
        showLog(newLogLines());
        await stopApp(c2);
        check(`[after ${host}] 7340 free after the normal launch stopped`, listeners(PORT).length === 0);
      }
    }
  } catch (e) {
    check("script completed", false, errLine(e));
    process.exitCode = 1;
  } finally {
    const leftovers = [...known.keys()].filter((p) => alive(p) && sameComm(p));
    if (leftovers.length) await stopRecorded("final", leftovers);
    await finish();
  }
}
