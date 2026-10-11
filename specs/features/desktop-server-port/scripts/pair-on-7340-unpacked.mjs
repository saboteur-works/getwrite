#!/usr/bin/env node
/**
 * Feature 80, Task 16 RE-RUN on the UNPACKED production build
 * (dist-electron/mac-arm64/GetWrite.app): pair a fresh, unpaired Chromium context at
 * http://<lan-ip>:7340/pair through the page's own field and button, with a code read
 * from the real app window's own "Show a pairing code" flow.
 *
 * Launch: throwaway --user-data-dir with a seeded workspace.json
 * { sharingEnabled: true, projectsDir: <throwaway> } (the packaged build otherwise
 * resolves projects to ~/Documents/GetWrite, see electron/src/projects-dir.ts).
 * Neither app.getPath("logs") nor app.getPath("documents") followed a throwaway HOME
 * (measured, first two attempts, which asserted that and stopped), so HOME is NOT
 * overridden; the app appends its own lines to its real log folder, which this
 * script never reads, truncates or deletes. The projects dir the app uses is
 * asserted through the window's own getWorkspaceDir bridge call.
 * The code is held in a variable only; never printed or written. Run OUTSIDE the
 * command sandbox. Refuses when anything listens on 7340, 3000 or 6006. Stops only
 * pids it recorded, by pid and unchanged command name.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 7340;
const SELF = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(SELF), "../../../..");
const APP_BIN = path.join(REPO, "dist-electron/mac-arm64/GetWrite.app/Contents/MacOS/GetWrite");
const say = (s) => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errLine = (e) => (e instanceof Error ? e.message.split("\n")[0] : String(e));
const lsof = (args) => { try { return execFileSync("lsof", args, { encoding: "utf8" }); } catch { return ""; } };
const listeners = (port) =>
  lsof(["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]).split("\n").slice(1).filter(Boolean).map((l) => { const c = l.split(/\s+/); return `${c[1]}(${c[0]})`; });
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

for (const port of [PORT, 3000, 6006]) {
  const l = listeners(port);
  if (l.length) { console.error(`refusing: something listens on ${port}: ${l.join(",")}`); process.exit(3); }
}
if (!existsSync(APP_BIN)) { console.error("unpacked app missing"); process.exit(2); }
const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address))?.address;
if (!lan) { console.error("no private IPv4 address"); process.exit(4); }

const realHome = homedir();
const ownerDirs = [
  path.join(realHome, "Library", "Application Support", "getwrite-electron"),
  path.join(realHome, "Library", "Logs", "getwrite-electron"),
  path.join(realHome, "Library", "Logs", "GetWrite"),
  path.join(realHome, "Documents", "GetWrite"),
];
const root = mkdtempSync(path.join(tmpdir(), "gw-pair7340u-"));
const realRoot = realpathSync(root);
const USERDATA = path.join(realRoot, "userdata");
const PROJECTS = path.join(realRoot, "projects");
for (const d of [USERDATA, PROJECTS]) mkdirSync(d, { recursive: true });
writeFileSync(path.join(USERDATA, "workspace.json"), `${JSON.stringify({ sharingEnabled: true, projectsDir: PROJECTS }, null, 2)}\n`);
for (const p of [USERDATA, PROJECTS]) {
  const rp = realpathSync(p);
  if (!rp.startsWith(realRoot) || ownerDirs.some((o) => rp.startsWith(o))) { console.error("path not throwaway"); process.exit(5); }
}

const { _electron, chromium } = createRequire(path.join(REPO, "frontend/package.json"))("@playwright/test");
const env = { ...process.env };
for (const k of ["DATABASE_URL", "BETTER_AUTH_SECRET", "GETWRITE_ENABLE_DEV_IDENTITY", "GETWRITE_BIND", "HOSTNAME", "GETWRITE_SHARING", "GETWRITE_WINDOW_SECRET", "GETWRITE_SHARING_DIR", "GETWRITE_PROJECTS_DIR", "ELECTRON_RUN_AS_NODE", "PORT"]) delete env[k];

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); say(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` -- ${detail}` : ""}`); };
say(`node=${process.version}; pre-check: listeners on ${PORT}: none; 3000: none; 6006: none; throwaway root under os.tmpdir() (name withheld); lan address is a private IPv4 (value withheld)`);

let app, browser, startedPid;
try {
  app = await _electron.launch({ executablePath: APP_BIN, args: [`--user-data-dir=${USERDATA}`], env, timeout: 300000 });
  startedPid = app.process().pid;
  known.set(startedPid, "GetWrite");
  say(`started app main pid=${startedPid}`);
  const info = await app.evaluate(({ app: a }) => ({ ud: a.getPath("userData"), logs: a.getPath("logs"), docs: a.getPath("documents"), packaged: a.isPackaged, name: a.getName() }));
  say(`app.getName()=${info.name}; isPackaged=${info.packaged}; documents folder resolves to ${info.docs.replace(realHome, "~")} (not used: projectsDir is overridden); logs folder (real user folder, the app appends its own lines; not read by this script): ${info.logs.replace(realHome, "~")}`);
  if (!info.packaged || realpathSync(info.ud) !== USERDATA) throw new Error("path/packaged assertion failed; stopping");
  say("asserted: isPackaged true, userData is the throwaway folder");

  const win = await app.firstWindow();
  let wsDir = null;
  for (let i = 0; i < 120 && wsDir === null; i++) {
    wsDir = await win.evaluate(() => (window.getwriteDesktop ? window.getwriteDesktop.getWorkspaceDir() : null)).catch(() => null);
    if (wsDir === null) await sleep(1000);
  }
  if (!wsDir || realpathSync(wsDir) !== PROJECTS) throw new Error(`projects dir used by the app is not the throwaway folder (${wsDir === null ? "unavailable" : "different"}); stopping`);
  say("asserted (via the window's own bridge getWorkspaceDir): the projects dir the app uses is the throwaway folder");
  await win.waitForURL(/^http:\/\/localhost:7340\//, { timeout: 300000 });
  await win.getByRole("button", { name: "App Settings", exact: true }).waitFor({ timeout: 300000 });
  recordTree(startedPid);
  say(`window origin: ${new URL(win.url()).origin}`);
  const lis = listeners(PORT);
  say(`listeners on ${PORT}: ${lis.join(",")}; all in recorded tree: ${lis.every((s) => known.has(Number(s.split("(")[0])))}`);
  say(`recorded process tree: ${[...known].map(([p, c]) => `${p}(${c})`).join(" ")}`);
  say(`listeners on 3000: ${listeners(3000).join(",") || "none"}`);
  const projLs = existsSync(PROJECTS) ? "exists" : "missing";
  say(`throwaway projects folder: ${projLs}`);

  await win.getByRole("button", { name: "App Settings", exact: true }).click();
  await win.getByLabel("Home network sharing").getByText("Sharing is on", { exact: true }).waitFor({ timeout: 60000 });
  await win.getByRole("button", { name: "Show a pairing code", exact: true }).click();
  const codeEl = win.locator("p.font-mono").first();
  await codeEl.waitFor({ timeout: 15000 });
  const code = (await codeEl.innerText()).trim();
  if (!/^\d{6}$/.test(code)) throw new Error("window did not show a 6-digit code");
  const wrong = code.split("").map((d) => String((Number(d) + 1) % 10)).join("");
  check("code obtained from the app window's own 'Show a pairing code' flow (6 digits; value withheld)", true);
  const devicesBefore = await win.getByRole("button", { name: /^Revoke / }).count();

  browser = await chromium.launch();
  say(`chromium version: ${browser.version()}`);
  const ctx = await browser.newContext();
  check("fresh context holds no cookie", (await ctx.cookies()).length === 0);
  const page = await ctx.newPage();
  const BASE = `http://${lan}:${PORT}`;
  const navs = [];
  let phase = "pair-page-idle";
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push({ phase, p: new URL(f.url()).pathname }); });
  const nextStatus = {};
  let nextPercent = 0;
  const nonOk = [];
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/_next/")) {
      nextStatus[r.status()] = (nextStatus[r.status()] ?? 0) + 1;
      if (u.pathname.includes("%")) nextPercent++;
      if (r.status() !== 200) nonOk.push(`${r.status()} ${u.pathname.slice(0, 60)}`);
    }
  });
  const pairReqs = [];
  page.on("request", (r) => { if (new URL(r.url()).pathname === "/api/sharing/pair") pairReqs.push({ method: r.method(), phase, status: null, req: r }); });
  page.on("response", (r) => { const e = pairReqs.find((x) => x.req === r.request()); if (e) e.status = r.status(); });
  const failed = [];
  page.on("requestfailed", (r) => failed.push(new URL(r.url()).pathname.slice(0, 60)));

  const resp = await page.goto(`${BASE}/pair`, { waitUntil: "load" });
  check("browser accepted port 7340 for /pair (HTTP 200)", resp?.status() === 200, `status ${resp?.status()}`);
  await page.getByRole("heading", { name: "Pair this device" }).waitFor({ timeout: 30000 });
  await sleep(8500);
  const idleNavs = navs.length;
  say(`(1) main-frame navigations on /pair, from goto through >=8 s idle before typing: ${idleNavs}; paths: ${navs.map((n) => n.p).join(" , ")}`);
  say(`(2) /_next/ response statuses by count: ${JSON.stringify(nextStatus)}; non-200 /_next/ responses: ${nonOk.length ? nonOk.join(" | ") : "none"}; /_next/ paths containing '%': ${nextPercent}; failed requests: ${failed.length}`);

  phase = "wrong-code";
  await page.getByLabel("Pairing code").fill(wrong);
  await page.getByRole("button", { name: "Pair", exact: true }).click();
  await sleep(4000);
  const alerts = await page.getByRole("alert").allInnerTexts().catch(() => []);
  const wrongPosts = pairReqs.filter((x) => x.phase === "wrong-code");
  say(`(3) wrong code: POST /api/sharing/pair requested ${wrongPosts.length} time(s), status(es) ${wrongPosts.map((x) => x.status).join(",") || "none"}; page alert text: ${JSON.stringify(alerts.map((t) => t.slice(0, 160)))}; url path now ${new URL(page.url()).pathname}; navigations since: ${navs.length - idleNavs}`);
  check("wrong code: page shows a message and is still not paired (no device cookie, still on /pair)", alerts.length > 0 && new URL(page.url()).pathname === "/pair" && !(await ctx.cookies()).some((c) => c.name === "getwrite_device"));

  phase = "real-code";
  const navsBeforeReal = navs.length;
  await page.getByLabel("Pairing code").fill(code);
  await page.getByRole("button", { name: "Pair", exact: true }).click();
  let paired = true;
  await page.waitForURL((u) => u.pathname === "/", { timeout: 20000 }).catch(async () => {
    paired = false;
    const alert = await page.getByRole("alert").allInnerTexts().catch(() => []);
    say(`did not reach / within 20 s; url path ${new URL(page.url()).pathname}; alert text: ${JSON.stringify(alert.map((t) => t.slice(0, 160)))}; input value length ${(await page.getByLabel("Pairing code").inputValue().catch(() => "")).length}; form button texts ${JSON.stringify(await page.locator("form button").allInnerTexts().catch(() => []))}`);
  });
  const realPosts = pairReqs.filter((x) => x.phase === "real-code");
  say(`(4) real code: POST /api/sharing/pair requested ${realPosts.length} time(s), status(es) ${realPosts.map((x) => x.status).join(",") || "none"}`);
  check("typing the code into the page's own field and pressing Pair reached the application page", paired);
  if (paired) {
    await page.getByRole("button", { name: "App Settings", exact: true }).waitFor({ timeout: 60000 });
    check("landed on the application page (path /, 'App Settings' present) at the LAN address on 7340", new URL(page.url()).port === String(PORT) && new URL(page.url()).pathname === "/");
    await sleep(3000);
    say(`navigations after pressing Pair with the real code: ${navs.length - navsBeforeReal}; paths: ${navs.slice(navsBeforeReal).map((n) => n.p).join(" , ")}`);
    check("device cookie present after pairing (value withheld)", (await ctx.cookies()).some((c) => c.name === "getwrite_device"));
    const ok = await page.evaluate(async () => (await fetch("/api/projects")).status);
    check("GET /api/projects from the paired context at the LAN address on 7340 returns 200", ok === 200, `status ${ok}`);
    await win.getByRole("button", { name: /^Revoke / }).first().waitFor({ timeout: 15000 }).catch(() => {});
    let after = await win.getByRole("button", { name: /^Revoke / }).count();
    if (after === devicesBefore) {
      await win.keyboard.press("Escape"); await sleep(500);
      await win.getByRole("button", { name: "App Settings", exact: true }).click().catch(() => {});
      await sleep(2500);
      after = await win.getByRole("button", { name: /^Revoke / }).count();
    }
    check("app window's paired-device list went from 0 to 1", devicesBefore === 0 && after === 1, `before ${devicesBefore}, after ${after}`);
  }
  say(`total main-frame navigations: ${navs.length}; by phase: ${JSON.stringify(navs.reduce((a, n) => ({ ...a, [n.phase]: (a[n.phase] ?? 0) + 1 }), {}))}`);
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
  say(`throwaway root removed: ${!existsSync(root)}`);
  say(`checks: ${results.filter(Boolean).length}/${results.length} passed`);
}
