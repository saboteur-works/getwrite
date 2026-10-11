#!/usr/bin/env node
/**
 * Feature 80, Task 6: what a client opening the OLD address (3000) sees, and
 * whether Playwright's Chromium accepts a page served on 7340.
 *
 * Steps (one at a time; every listener is the script's own):
 *   1. refuse to run if anything listens on 3000 or 7340;
 *   2. with nothing on 3000: Chromium -> http://<lan-ip>:3000 and http://localhost:3000;
 *   3. start `pnpm dev` (next dev of the repo's frontend, in a copied fake repo root,
 *      sharing off, throwaway GETWRITE_PROJECTS_DIR, no HOSTNAME/PORT) and, FROM THE HOST
 *      to its own LAN address on 3000, request GET /api/projects and GET /: status,
 *      whether the x-getwrite-gate header is present, body shape only; stop by pid;
 *   4. start a plain HTTP server (this file with --listener, bind 0.0.0.0, port 7340,
 *      tiny marker page, 200): Chromium -> http://<lan-ip>:7340 and http://localhost:7340;
 *      stop by pid; confirm 7340 free.
 *
 * The LAN address is never printed: it is shown as <lan-ip>.
 * Run OUTSIDE the command sandbox. Stops only recorded pids (descendants by parent
 * pid while alive), never by port. Never touches ~/Library/Application Support/getwrite-electron
 * or ~/Library/Logs/getwrite-electron. No cookie, secret or credential is read or printed.
 */
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import http from "node:http";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const OLD = 3000;
const NEW = 7340;
const MARKER = "PORT-7340-MARKER-PAGE";

if (process.argv[2] === "--listener") {
  const s = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><title>${MARKER}</title><h1>${MARKER}</h1>`);
  });
  s.listen(NEW, "0.0.0.0", () => console.log("listening"));
  process.on("SIGTERM", () => process.exit(0));
} else {
  await main();
}

async function main() {
  const REPO = path.resolve(path.dirname(SELF), "../../../..");
  const say = (s) => console.log(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const lsofRows = (port) => {
    try {
      return execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).split("\n").slice(1).filter(Boolean);
    } catch {
      return [];
    }
  };
  for (const p of [OLD, NEW]) {
    if (lsofRows(p).length) {
      console.error(`refusing to run: something listens on ${p} before this script started anything`);
      process.exit(3);
    }
  }
  say(`pre-check: no listener on ${OLD} and none on ${NEW} (lsof -nP -iTCP:<port> -sTCP:LISTEN printed nothing for each) before anything was started`);

  // LAN address: first non-internal IPv4; never printed
  let LAN = null;
  for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) if (a.family === "IPv4" && !a.internal && !LAN) LAN = a.address;
  const mask = (s) => (LAN ? String(s).split(LAN).join("<lan-ip>") : String(s));
  say(LAN ? "host LAN IPv4 found (shown as <lan-ip>)" : "host has NO non-internal IPv4 address");

  const nodeRequire = createRequire(path.join(REPO, "frontend/package.json"));
  const { chromium } = nodeRequire("@playwright/test");

  const psTable = () =>
    execFileSync("ps", ["-A", "-o", "pid=,ppid=,comm="], { encoding: "utf8" })
      .split("\n").map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
      .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), comm: path.basename(m[3]) }));
  const known = new Map();
  const recordTree = (root) => {
    const t = psTable();
    const set = new Set([root]);
    for (let g = true; g; ) { g = false; for (const p of t) if (set.has(p.ppid) && !set.has(p.pid)) { set.add(p.pid); g = true; } }
    for (const p of t) if (set.has(p.pid)) known.set(p.pid, p.comm);
  };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
  const sameComm = (pid) => { const r = psTable().find((p) => p.pid === pid); return r !== undefined && r.comm === known.get(pid); };
  const stopGroup = async (label) => {
    let left = [...known.keys()].filter((p) => alive(p) && sameComm(p));
    say(`${label}: pids recorded ${[...known.keys()].join(",") || "none"}; alive before stop: ${left.join(",") || "none"}`);
    for (const sig of ["SIGTERM", "SIGKILL"]) {
      if (!left.length) break;
      for (const p of left) { try { process.kill(p, sig); } catch { /* gone */ } }
      await sleep(3000);
      left = left.filter((p) => alive(p) && sameComm(p));
      say(`${label}: after ${sig} to recorded pids: ${left.join(",") || "none alive"}`);
    }
    known.clear();
  };

  // throwaway folders
  const ownerDir = path.join(homedir(), "Library", "Application Support", "getwrite-electron");
  const root = mkdtempSync(path.join(tmpdir(), "gw-oldport-"));
  const realRoot = realpathSync(root);
  const fake = path.join(realRoot, "repo");
  const PROJECTS = path.join(realRoot, "projects");
  mkdirSync(path.join(fake, "electron"), { recursive: true });
  mkdirSync(PROJECTS);
  cpSync(path.join(REPO, "package.json"), path.join(fake, "package.json"));
  cpSync(path.join(REPO, "pnpm-workspace.yaml"), path.join(fake, "pnpm-workspace.yaml"));
  symlinkSync(path.join(REPO, "frontend"), path.join(fake, "frontend"));
  symlinkSync(path.join(REPO, "getwrite-config"), path.join(fake, "getwrite-config"));
  for (const p of [PROJECTS, fake]) {
    const r = realpathSync(p);
    if (!r.startsWith(realRoot) || r.startsWith(ownerDir)) throw new Error("not a throwaway path");
  }
  const snap = () => {
    try { return createHash("sha256").update(readdirSync(path.join(REPO, "projects")).sort().join("\n")).digest("hex").slice(0, 12) + ` (${readdirSync(path.join(REPO, "projects")).length} names)`; } catch { return "unreadable"; }
  };
  say(`repo projects/ BEFORE (hash of names): ${snap()}`);
  say(`node ${process.version}; throwaway root under os.tmpdir() (name withheld), asserted not inside the owner's userData`);

  const browser = await chromium.launch();
  say(`Chromium (Playwright) version: ${browser.version()}`);
  const visit = async (url, shown) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    let outcome;
    try {
      const resp = await page.goto(url, { timeout: 20000, waitUntil: "load" });
      const text = (await page.evaluate(() => document.body ? document.body.innerText : "")).replace(/\s+/g, " ").trim().slice(0, 300);
      outcome = `LOADED status=${resp ? resp.status() : "none"} title=${JSON.stringify(await page.title())} text=${JSON.stringify(text.slice(0, 120))} finalUrl=${shown}`;
    } catch (e) {
      const msg = mask(e instanceof Error ? e.message.split("\n")[0] : "error");
      let text = "";
      let pageUrl = "";
      try { pageUrl = mask(page.url()); text = (await page.evaluate(() => document.body ? document.body.innerText : "")).replace(/\s+/g, " ").trim().slice(0, 300); } catch { text = "<unreadable>"; }
      outcome = `NOT LOADED goto error=${JSON.stringify(msg)}; page url after=${JSON.stringify(pageUrl)}; page text=${JSON.stringify(mask(text))}`;
    }
    await ctx.close();
    say(`  ${shown}: ${outcome}`);
  };
  const both = async (port) => {
    if (LAN) await visit(`http://${LAN}:${port}/`, `http://<lan-ip>:${port}/`);
    else say(`  http://<lan-ip>:${port}/: not run (no LAN address)`);
    await visit(`http://localhost:${port}/`, `http://localhost:${port}/`);
  };

  try {
    say(`--- step 2: nothing on ${OLD} ---`);
    say(`listeners on ${OLD}: ${lsofRows(OLD).length ? "SOME (stopping)" : "none"}`);
    if (lsofRows(OLD).length) throw new Error("listener appeared on 3000");
    await both(OLD);

    say(`--- step 3: throwaway next dev on ${OLD} (sharing off) ---`);
    const env = { ...process.env };
    for (const k of ["DATABASE_URL", "BETTER_AUTH_SECRET", "GETWRITE_ENABLE_DEV_IDENTITY", "GETWRITE_BIND", "HOSTNAME", "GETWRITE_SHARING", "GETWRITE_WINDOW_SECRET", "GETWRITE_SHARING_DIR", "GETWRITE_PROJECTS_DIR", "ELECTRON_RUN_AS_NODE", "PORT"]) delete env[k];
    env.GETWRITE_PROJECTS_DIR = PROJECTS;
    say(`command: (cwd=<fake tree>/frontend) pnpm dev  GETWRITE_SHARING=(unset: off) GETWRITE_PROJECTS_DIR=<throwaway> PORT=(unset) HOSTNAME=(unset)`);
    const child = spawn("pnpm", ["dev"], { cwd: path.join(fake, "frontend"), env, stdio: ["ignore", "pipe", "pipe"] });
    known.set(child.pid, "pnpm");
    say(`started pnpm pid=${child.pid}`);
    const out = [];
    for (const s of [child.stdout, child.stderr]) s.on("data", (d) => out.push(...d.toString().replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").split("\n").filter(Boolean)));
    const t0 = Date.now();
    let up = false;
    while (Date.now() - t0 < 120000) {
      recordTree(child.pid);
      if (lsofRows(OLD).length) { up = true; break; }
      await sleep(500);
    }
    await sleep(3000);
    recordTree(child.pid);
    const rows = lsofRows(OLD).map((l) => { const c = l.split(/\s+/); return `pid ${c[1]} (${c[0]}) ${c[c.length - 2]}`; });
    say(`listening on ${OLD}: ${up} after ${Date.now() - t0} ms; listener rows: ${rows.join("; ")}; recorded pids: ${[...known.entries()].map(([p, c]) => `${p}(${c})`).join(",")}`);
    const ownPids = rows.map((r) => Number(r.split(" ")[1]));
    if (!up || !ownPids.every((p) => known.has(p))) throw new Error("listener on 3000 is not a recorded pid; stopping");
    const get = (p) => new Promise((resolve) => {
      const req = http.get({ host: LAN, port: OLD, path: p, timeout: 90000 }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, gate: "x-getwrite-gate" in res.headers, ctype: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks).toString("utf8") }));
      });
      req.on("error", (e) => resolve({ error: mask(e.code ?? e.message) }));
      req.on("timeout", () => { req.destroy(); resolve({ error: "timeout" }); });
    });
    if (!LAN) say("  no LAN address: step 3 request not run");
    else {
      say("  LABEL: requests below were made FROM THE HOST to its own LAN address; this is NOT a second device.");
      const api = await get("/api/projects");
      let shape = "";
      if (!api.error) { try { const j = JSON.parse(api.body); shape = Array.isArray(j) ? `JSON array, length ${j.length}` : `JSON ${typeof j}, keys ${Object.keys(j ?? {}).slice(0, 8).join(",")}`; } catch { shape = `non-JSON body, length ${api.body.length}`; } }
      say(`  GET http://<lan-ip>:${OLD}/api/projects -> ${api.error ? `error ${api.error}` : `status ${api.status}; x-getwrite-gate header ${api.gate ? "PRESENT" : "absent"}; content-type ${api.ctype}; body: ${shape}`}`);
      const pg = await get("/");
      say(`  GET http://<lan-ip>:${OLD}/ -> ${pg.error ? `error ${pg.error}` : `status ${pg.status}; x-getwrite-gate header ${pg.gate ? "PRESENT" : "absent"}; content-type ${pg.ctype}; body length ${pg.body.length}`}`);
    }
    say(`  next dev output lines (first 8, masked): ${out.slice(0, 8).map((l) => mask(l).slice(0, 140)).join(" | ")}`);
    await stopGroup("next dev");
    await sleep(1000);
    say(`listeners on ${OLD} after stop: ${lsofRows(OLD).length ? "SOME" : "none"}`);

    say(`--- step 4: throwaway plain HTTP server on ${NEW} (0.0.0.0) ---`);
    if (lsofRows(NEW).length) throw new Error("listener on 7340 appeared; stopping");
    const l = spawn(process.execPath, [SELF, "--listener"], { stdio: ["ignore", "pipe", "inherit"] });
    known.set(l.pid, path.basename(process.execPath));
    say(`started listener pid=${l.pid}`);
    for (let i = 0; i < 40 && lsofRows(NEW).length === 0; i++) await sleep(100);
    const lr = lsofRows(NEW).map((x) => { const c = x.split(/\s+/); return `pid ${c[1]} (${c[0]}) ${c[c.length - 2]}`; });
    say(`listeners on ${NEW}: ${lr.join("; ")}`);
    if (lr.length !== 1 || !lr[0].startsWith(`pid ${l.pid} `)) throw new Error("the only listener on 7340 is not the throwaway one; stopping");
    await both(NEW);
    await stopGroup("7340 listener");
    await sleep(500);
    say(`listeners on ${NEW} after stop: ${lsofRows(NEW).length ? "SOME" : "none"}`);
  } catch (e) {
    say(`script error: ${mask(e instanceof Error ? e.message.split("\n")[0] : "unknown")}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await stopGroup("final sweep");
    say(`listeners on ${OLD}: ${lsofRows(OLD).length ? "SOME" : "none"}; on ${NEW}: ${lsofRows(NEW).length ? "SOME" : "none"}`);
    say(`repo projects/ AFTER (hash of names): ${snap()}`);
    rmSync(root, { recursive: true, force: true });
    say(`throwaway root removed: ${!existsSync(root)}`);
  }
}
