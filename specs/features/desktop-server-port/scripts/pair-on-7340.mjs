#!/usr/bin/env node
/**
 * Feature 80, Task 16: pair a fresh, unpaired Chromium context at
 * http://<lan-ip>:7340 with a code obtained through the real Electron app's own
 * window flow, counting main-frame navigations on the pairing page.
 *
 * Real Electron (dev code path, copied tree with a throwaway package `name` so
 * app.getPath("logs") is a throwaway folder), throwaway --user-data-dir,
 * throwaway projects folder. Sharing is turned on by SEEDING sharingEnabled in
 * the throwaway workspace.json (restart cannot be driven), as Feature 77 did.
 * The code is read from the app window after "Show a pairing code" is clicked,
 * held in a local variable, typed into the page's own field; never printed or
 * written. Run OUTSIDE the command sandbox.
 *
 * Refuses to run when anything listens on 7340 or 3000. Stops only pids it
 * recorded (the pid it started and descendants), by pid, never by name/port.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 7340;
const SELF = fileURLToPath(import.meta.url);
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
    return `${c[1]}(${c[0]})`;
  });
const psTable = () =>
  execFileSync("ps", ["-A", "-o", "pid=,ppid=,comm="], { encoding: "utf8" })
    .split("\n").map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), comm: path.basename(m[3]) }));
const known = new Map();
const recordTree = (rootPid) => {
  const table = psTable();
  const set = new Set([rootPid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of table) if (set.has(p.ppid) && !set.has(p.pid)) { set.add(p.pid); grew = true; }
  }
  for (const p of table) if (set.has(p.pid) && p.pid !== process.pid) known.set(p.pid, p.comm);
};
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
const sameComm = (pid) => psTable().find((p) => p.pid === pid)?.comm === known.get(pid);

for (const port of [PORT, 3000]) {
  const l = listeners(port);
  if (l.length) { console.error(`refusing: something listens on ${port}: ${l.join(",")}`); process.exit(3); }
}
const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address))?.address;
if (!lan) { console.error("no private IPv4 address"); process.exit(4); }

const root = mkdtempSync(path.join(tmpdir(), "gw-pair7340-"));
const realRoot = realpathSync(root);
const ownerDirs = [path.join(homedir(), "Library", "Application Support", "getwrite-electron"), path.join(homedir(), "Library", "Logs", "getwrite-electron")];
const LOGNAME = `gw-pair7340-throwaway-${path.basename(realRoot)}`;
const LOGDIR = path.join(homedir(), "Library", "Logs", LOGNAME);
const fake = path.join(realRoot, "repo");
const USERDATA = path.join(realRoot, "userdata");
const PROJECTS = path.join(fake, "projects");
mkdirSync(path.join(fake, "electron"), { recursive: true });
mkdirSync(PROJECTS);
mkdirSync(USERDATA);
cpSync(path.join(REPO, "electron/dist"), path.join(fake, "electron/dist"), { recursive: true });
const pkg = JSON.parse(readFileSync(path.join(REPO, "electron/package.json"), "utf8"));
pkg.name = LOGNAME;
delete pkg.productName;
writeFileSync(path.join(fake, "electron/package.json"), JSON.stringify(pkg, null, 2));
cpSync(path.join(REPO, "package.json"), path.join(fake, "package.json"));
cpSync(path.join(REPO, "pnpm-workspace.yaml"), path.join(fake, "pnpm-workspace.yaml"));
symlinkSync(path.join(REPO, "frontend"), path.join(fake, "frontend"));
symlinkSync(path.join(REPO, "getwrite-config"), path.join(fake, "getwrite-config"));
writeFileSync(path.join(USERDATA, "workspace.json"), `${JSON.stringify({ sharingEnabled: true }, null, 2)}\n`);
for (const p of [USERDATA, PROJECTS]) {
  if (!realpathSync(p).startsWith(realRoot) || ownerDirs.some((o) => realpathSync(p).startsWith(o))) { console.error("path not throwaway"); process.exit(5); }
}

const { _electron, chromium } = createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
const ELECTRON_BIN = path.join(REPO, "electron/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const env = { ...process.env };
for (const k of ["DATABASE_URL", "BETTER_AUTH_SECRET", "GETWRITE_ENABLE_DEV_IDENTITY", "GETWRITE_BIND", "HOSTNAME", "GETWRITE_SHARING", "GETWRITE_WINDOW_SECRET", "GETWRITE_SHARING_DIR", "GETWRITE_PROJECTS_DIR", "ELECTRON_RUN_AS_NODE", "PORT"]) delete env[k];

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); say(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` -- ${detail}` : ""}`); };
say(`node=${process.version}; pre-check: listeners on ${PORT}: none; on 3000: none; throwaway root under os.tmpdir() (name withheld); lan address is a private IPv4 (value withheld)`);
say("sharing enabled by seeding sharingEnabled in the throwaway workspace.json (restart cannot be driven)");

let app;
let browser;
let startedPid;
try {
  app = await _electron.launch({ executablePath: ELECTRON_BIN, args: [path.join(fake, "electron"), `--user-data-dir=${USERDATA}`], env, timeout: 300000 });
  startedPid = app.process().pid;
  known.set(startedPid, "electron-main");
  say(`started electron pid=${startedPid}`);
  const info = await app.evaluate(({ app: a }) => ({ ud: a.getPath("userData"), logs: a.getPath("logs"), packaged: a.isPackaged }));
  if (realpathSync(info.ud) !== USERDATA || ownerDirs.some((o) => info.ud.startsWith(o)) || info.logs !== LOGDIR) throw new Error("userData/logs path assertion failed; stopping");
  say(`asserted: userData is the throwaway folder, logs folder is the throwaway one, isPackaged=${info.packaged}`);

  const win = await app.firstWindow();
  await win.waitForURL(/^http:\/\/localhost:7340\//, { timeout: 300000 });
  await win.getByRole("button", { name: "App Settings", exact: true }).waitFor({ timeout: 300000 });
  recordTree(startedPid);
  say(`window origin: ${new URL(win.url()).origin}`);
  const lis = listeners(PORT);
  say(`listeners on ${PORT}: ${lis.join(",")}; all in recorded tree: ${lis.every((s) => known.has(Number(s.split("(")[0])))}`);
  say(`listeners on 3000: ${listeners(3000).join(",") || "none"}`);

  await win.getByRole("button", { name: "App Settings", exact: true }).click();
  await win.getByLabel("Home network sharing").getByText("Sharing is on", { exact: true }).waitFor({ timeout: 60000 });
  await win.getByRole("button", { name: "Show a pairing code", exact: true }).click();
  const codeEl = win.locator("p.font-mono").first();
  await codeEl.waitFor({ timeout: 15000 });
  const code = (await codeEl.innerText()).trim();
  if (!/^\d{6}$/.test(code)) throw new Error("window did not show a 6-digit code");
  check("code obtained from the app window's own 'Show a pairing code' flow (6 digits; value withheld)", true);
  const devicesBefore = await win.getByRole("button", { name: /^Revoke / }).count();

  browser = await chromium.launch();
  say(`chromium version: ${browser.version()}`);
  const ctx = await browser.newContext();
  check("fresh context holds no cookie", (await ctx.cookies()).length === 0);
  const page = await ctx.newPage();
  const BASE = `http://${lan}:${PORT}`;
  const navs = [];
  let phase = "pair-page";
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) navs.push({ phase, p: new URL(f.url()).pathname });
  });
  const refusals = [];
  page.on("requestfailed", (r) => refusals.push(new URL(r.url()).pathname));
  const nextStatus = {};
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (r.status() === 307) { let loc = ""; try { loc = new URL(r.headers()["location"] ?? "", r.url()).pathname; } catch {} say(`  307 from ${u.pathname.slice(0, 80)} to ${loc.slice(0, 80)}; x-getwrite-gate=${r.headers()["x-getwrite-gate"] ?? "absent"}`); }
    if (u.pathname.startsWith("/_next/")) nextStatus[r.status()] = (nextStatus[r.status()] ?? 0) + 1;
  });
  const consoleErrs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consoleErrs.push(m.text().split("\n")[0].slice(0, 200)); });
  const resp = await page.goto(`${BASE}/pair`, { waitUntil: "load" });
  check("browser accepted port 7340 for /pair (HTTP 200)", resp?.status() === 200, `status ${resp?.status()}`);
  await page.getByRole("heading", { name: "Pair this device" }).waitFor({ timeout: 30000 });
  await sleep(6000);
  const pairPageNavs = navs.length;
  say(`/_next/ response statuses (count by status) on the pairing page: ${JSON.stringify(nextStatus)}; console error/warning messages: ${consoleErrs.length}`);
  for (const m of consoleErrs.slice(0, 5)) say(`  console: ${m}`);
  say(`main-frame navigations on /pair in ~6 s after load (including the goto): ${pairPageNavs}; paths: ${navs.map((n) => n.p).join(" , ")}`);
  check("pairing page still shows 'Pair this device' after settling", (await page.getByRole("heading", { name: "Pair this device" }).count()) === 1);

  phase = "after-submit";
  page.on("response", (r) => {
    if (new URL(r.url()).pathname === "/api/sharing/pair") say(`pair route response: status ${r.status()}, method ${r.request().method()}`);
  });
  await page.getByLabel("Pairing code").fill(code);
  await page.getByRole("button", { name: "Pair", exact: true }).click();
  let typedPairing = true;
  await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 }).catch(async () => {
    typedPairing = false;
    const alert = await page.getByRole("alert").allInnerTexts().catch(() => []);
    say(`navigations since submit: ${navs.length - pairPageNavs}; input value length now ${(await page.getByLabel("Pairing code").inputValue().catch(() => "")).length}; button text ${JSON.stringify(await page.locator("form button").allInnerTexts().catch(() => []))}`);
    say(`did not reach / within 15 s; url path ${new URL(page.url()).pathname}; alert text: ${JSON.stringify(alert)}`);
  });
  check("typing the code into the page's own field and pressing Pair reached the application page (FR-20 done condition)", typedPairing);
  if (!typedPairing) {
    // SUPPLEMENTARY, not the done-condition: the page's own submit did not pair. Post the same (still unused) code
    // with fetch from inside the page, then load "/", only to measure port acceptance for an application page
    // and the device list. This is NOT the page's own flow.
    const st = await page.evaluate(async (c) => (await fetch("/api/sharing/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: c }) })).status, code);
    say(`SUPPLEMENTARY fetch-from-page pair POST status: ${st}`);
    await page.goto(`${BASE}/`, { waitUntil: "load" });
  }
  await page.getByRole("button", { name: "App Settings", exact: true }).waitFor({ timeout: 60000 });
  check("landed on the application page (path /, 'App Settings' button present) at the LAN address on 7340", new URL(page.url()).port === String(PORT) && new URL(page.url()).pathname === "/", `path ${new URL(page.url()).pathname}`);
  await sleep(3000);
  say(`main-frame navigations after submit: ${navs.length - pairPageNavs}; paths: ${navs.slice(pairPageNavs).map((n) => n.p).join(" , ")}`);
  say(`total main-frame navigations: ${navs.length}; failed requests during run: ${refusals.length}`);
  const cookies = await ctx.cookies();
  check("device cookie present in the context after pairing (value withheld)", cookies.some((c) => c.name === "getwrite_device"));
  const ok = await page.evaluate(async () => (await fetch("/api/projects")).status);
  check("an application API request from the paired context at the LAN address on 7340 returns 200", ok === 200, `status ${ok}`);

  // device list in the app window (generic label only)
  await win.getByRole("button", { name: /^Revoke / }).first().waitFor({ timeout: 15000 }).catch(() => {});
  let devicesAfter = await win.getByRole("button", { name: /^Revoke / }).count();
  if (devicesAfter === devicesBefore) {
    await win.keyboard.press("Escape");
    await sleep(500);
    await win.getByRole("button", { name: "App Settings", exact: true }).click().catch(() => {});
    await sleep(2500);
    devicesAfter = await win.getByRole("button", { name: /^Revoke / }).count();
  }
  check("app window's paired-device list gained one device", devicesBefore === 0 && devicesAfter === 1, `before ${devicesBefore}, after ${devicesAfter}`);
  say("note: requests above were sent from this host to its own LAN address; this is NOT a second-device result");
} catch (e) {
  check("script completed", false, errLine(e));
} finally {
  try { await browser?.close(); } catch {}
  if (startedPid !== undefined) {
    recordTree(startedPid);
    try { await Promise.race([app.close(), sleep(20000)]); } catch (e) { say(`app.close: ${errLine(e)}`); }
    await sleep(3000);
    let left = [...known.keys()].filter((p) => alive(p) && sameComm(p));
    say(`pids recorded: ${known.size}; alive after app.close: ${left.map((p) => `${p}(${known.get(p)})`).join(",") || "none"}`);
    for (const sig of ["SIGTERM", "SIGKILL"]) {
      if (!left.length) break;
      for (const p of left) { try { process.kill(p, sig); } catch {} }
      await sleep(3000);
      left = left.filter((p) => alive(p) && sameComm(p));
      say(`after ${sig}: ${left.join(",") || "none alive"}`);
    }
  }
  say(`listeners on ${PORT} after: ${listeners(PORT).join(",") || "none"}; on 3000: ${listeners(3000).join(",") || "none"}`);
  rmSync(root, { recursive: true, force: true });
  rmSync(LOGDIR, { recursive: true, force: true });
  say(`throwaway root removed: ${!existsSync(root)}; log folder removed: ${!existsSync(LOGDIR)}`);
  say(`checks: ${results.filter(Boolean).length}/${results.length} passed`);
}
