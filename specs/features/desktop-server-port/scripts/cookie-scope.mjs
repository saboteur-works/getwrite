#!/usr/bin/env node
/**
 * Feature 80, Task 5: is a device paired at one port treated as paired at
 * another port on the same host, with the same credential store? Measured in
 * Playwright's Chromium against two instances of the BUILT standalone server.
 *
 * Usage: node cookie-scope.mjs
 *
 * Needs a finished `pnpm build` in frontend/ with `.next/static` copied into
 * `.next/standalone/frontend/.next/static`. Run OUTSIDE the command sandbox
 * (servers and Chromium need it).
 *
 * Both servers: same build, GETWRITE_SHARING=1, the SAME throwaway
 * GETWRITE_SHARING_DIR, a throwaway GETWRITE_WINDOW_SECRET (never printed),
 * own PORT and own throwaway GETWRITE_PROJECTS_DIR, HOSTNAME and
 * GETWRITE_BIND 0.0.0.0 so the LAN address is reachable. The pairing code is
 * written to pairing-state.json as the smoke does (salted HMAC) and typed into
 * the pairing page of a fresh browser context; it is never printed.
 *
 * Safety: refuses when anything listens on 3000 or 7340, or on a chosen port;
 * picks two free ports; records every pid it starts (plus descendants by
 * parent-pid recursion while alive) and stops only those, never by port. Never
 * touches ~/Library/Application Support/getwrite-electron or
 * ~/Library/Logs/getwrite-electron. Output is labels, statuses, counts and DOM
 * facts. It never prints a cookie value, window secret or pairing code.
 */
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../..");
const FRONTEND = path.join(REPO, "frontend");
const SERVER = path.join(FRONTEND, ".next/standalone/frontend/server.js");
const nodeRequire = createRequire(path.join(FRONTEND, "package.json"));
const { chromium } = nodeRequire("@playwright/test");

const started = new Set();
const results = {};
const say = (line) => console.log(line);

function listeners(port) {
  try {
    return execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "0.0.0.0", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return null;
}

function descendants(pid) {
  const out = new Set([pid]);
  try {
    const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" })
      .trim()
      .split("\n")
      .map((l) => l.trim().split(/\s+/).map(Number));
    let grew = true;
    while (grew) {
      grew = false;
      for (const [p, pp] of rows) {
        if (out.has(pp) && !out.has(p)) {
          out.add(p);
          grew = true;
        }
      }
    }
  } catch {
    // ps unavailable: keep what we have
  }
  return out;
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function startServer(port, projectsDir, sharingDir, secret) {
  const child = spawn(process.execPath, [SERVER], {
    cwd: path.dirname(SERVER),
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "0.0.0.0",
      GETWRITE_BIND: "0.0.0.0",
      GETWRITE_SHARING: "1",
      GETWRITE_SHARING_DIR: sharingDir,
      GETWRITE_WINDOW_SECRET: secret,
      GETWRITE_PROJECTS_DIR: projectsDir,
    },
    stdio: "ignore",
  });
  started.add(child.pid);
  return child;
}

async function waitReady(base, secret, child) {
  for (let i = 0; i < 150; i += 1) {
    if (child.exitCode !== null) throw new Error("server exited before ready");
    try {
      const res = await fetch(`${base}/api/auth-status`, {
        headers: { "x-getwrite-window": secret },
      });
      if (res.status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not become ready");
}

function writePairingState(dir, code) {
  const salt = randomBytes(16);
  const now = Date.now();
  writeFileSync(
    path.join(dir, "pairing-state.json"),
    JSON.stringify({
      version: 1,
      salt: salt.toString("hex"),
      codeHash: createHmac("sha256", salt).update(code).digest("hex"),
      expiresAt: now + 300000,
      attempts: 0,
      dead: false,
      used: false,
      generatedAt: now,
    }),
  );
}

/** Attributes only, never the value. */
async function cookieFacts(context, url) {
  const all = await context.cookies(url);
  return all.map((c) => ({
    name: c.name,
    domain: c.domain,
    path: c.path,
    sameSite: c.sameSite,
    httpOnly: c.httpOnly,
    secure: c.secure,
    expiryPresent: typeof c.expires === "number" && c.expires > 0,
    expiresInDays:
      typeof c.expires === "number" && c.expires > 0
        ? Math.round(((c.expires * 1000 - Date.now()) / 86400000) * 10) / 10
        : null,
  }));
}

async function pageFacts(page, url) {
  const response = await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const redirectedFrom = response?.request().redirectedFrom() ?? null;
  const finalUrl = new URL(page.url());
  const facts = await page.evaluate(() => ({
    title: document.title,
    pairingInputPresent:
      document.querySelector('input[inputmode="numeric"]') !== null,
    h1: document.querySelector("h1")?.textContent?.slice(0, 80) ?? null,
    bodyTextLength: (document.body?.innerText ?? "").length,
  }));
  return {
    status: response?.status() ?? null,
    redirected: redirectedFrom !== null,
    redirectStatus: redirectedFrom
      ? ((await redirectedFrom.response())?.status() ?? null)
      : null,
    finalPath: finalUrl.pathname + (finalUrl.search ? "?<query>" : ""),
    finalPort: finalUrl.port,
    ...facts,
  };
}

async function storageFacts(page, marker) {
  return page.evaluate((m) => ({
    localKeyCount: localStorage.length,
    localMarkerPresent: localStorage.getItem(m) !== null,
    sessionKeyCount: sessionStorage.length,
    sessionMarkerPresent: sessionStorage.getItem(m) !== null,
  }), marker);
}

async function main() {
  const tmp = os.tmpdir();
  if (!existsSync(tmp)) throw new Error("os.tmpdir() does not exist");
  if (!existsSync(SERVER)) throw new Error("built standalone server missing");
  const buildId = readFileSync(
    path.join(FRONTEND, ".next/standalone/frontend/.next/BUILD_ID"),
    "utf8",
  ).trim();
  if (!existsSync(path.join(FRONTEND, ".next/standalone/frontend/.next/static"))) {
    throw new Error("static directory not copied into the standalone build");
  }
  for (const p of [3000, 7340]) {
    if (listeners(p) !== "") throw new Error(`refusing: something listens on ${p}`);
  }
  const ip = lanIp();
  if (ip === null) {
    say("NO LAN ADDRESS on this machine: recorded, stopping.");
    return;
  }

  const portA = await freePort();
  let portB = await freePort();
  while (portB === portA) portB = await freePort();
  for (const p of [portA, portB]) {
    if (listeners(p) !== "") throw new Error(`chosen port ${p} is busy`);
  }

  const base = mkdtempSync(path.join(tmp, "gw-cookie-scope-"));
  const resolved = path.resolve(base);
  if (!resolved.startsWith(path.resolve(tmp)) || resolved.includes("getwrite-electron")) {
    throw new Error("throwaway path assertion failed");
  }
  const sharingDir = path.join(base, "sharing");
  const projA = path.join(base, "projects-a");
  const projB = path.join(base, "projects-b");
  for (const d of [sharingDir, projA, projB]) mkdirSync(d, { recursive: true });
  const secret = randomBytes(32).toString("hex");

  say(`build id present: ${buildId.length > 0}; ports A=${portA} B=${portB}; lan address shown as <lan-ip>`);
  const childA = startServer(portA, projA, sharingDir, secret);
  const childB = startServer(portB, projB, sharingDir, secret);
  say(`server pids started: A=${childA.pid} B=${childB.pid}`);

  let browser;
  try {
    await waitReady(`http://127.0.0.1:${portA}`, secret, childA);
    await waitReady(`http://127.0.0.1:${portB}`, secret, childB);
    for (const c of [childA, childB]) {
      for (const p of descendants(c.pid)) started.add(p);
    }
    say(`both ready; recorded pid set: ${[...started].join(",")}`);

    browser = await chromium.launch();
    say(`chromium version: ${browser.version()}`);
    const urlA = `http://${ip}:${portA}`;
    const urlB = `http://${ip}:${portB}`;
    const marker = "gw_scope_marker";

    const context = await browser.newContext();
    const page = await context.newPage();

    results.beforePairA = await pageFacts(page, `${urlA}/`);
    say(`unpaired at A (/): ${JSON.stringify(results.beforePairA)}`);
    say(`cookies for A before pairing: ${(await context.cookies(urlA)).length}`);

    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    writePairingState(sharingDir, code);
    await page.goto(`${urlA}/pair`, { waitUntil: "load" });
    await page.locator('input[inputmode="numeric"]').fill(code);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !location.pathname.startsWith("/pair"), null, {
      timeout: 15000,
    }).catch(() => {});
    await page.waitForTimeout(1000);
    const afterPairPath = new URL(page.url()).pathname;
    say(`after submitting the code at A: path ${afterPairPath}`);

    results.cookiesA = await cookieFacts(context, urlA);
    say(`cookie attributes for A: ${JSON.stringify(results.cookiesA)}`);
    results.pairedA = await pageFacts(page, `${urlA}/`);
    say(`paired at A (/): ${JSON.stringify(results.pairedA)}`);

    await page.evaluate((m) => {
      localStorage.setItem(m, "1");
      sessionStorage.setItem(m, "1");
    }, marker);
    results.storageA = await storageFacts(page, marker);
    say(`storage at A (marker set): ${JSON.stringify(results.storageA)}`);

    const cookiesBBefore = await cookieFacts(context, urlB);
    say(`cookie records the context would send to B before requesting B: ${cookiesBBefore.length}`);

    results.apiB = null;
    const apiB = await context.request.get(`${urlB}/api/auth-status`, { maxRedirects: 0 });
    results.apiB = { status: apiB.status(), gate: apiB.headers()["x-getwrite-gate"] ?? null };
    say(`context.request GET B /api/auth-status: ${JSON.stringify(results.apiB)}`);

    results.pageB = await pageFacts(page, `${urlB}/`);
    say(`same context, B (/): ${JSON.stringify(results.pageB)}`);
    results.cookiesB = await cookieFacts(context, urlB);
    say(`cookie attributes for B: ${JSON.stringify(results.cookiesB)}`);
    results.storageB = await storageFacts(page, marker);
    say(`storage at B: ${JSON.stringify(results.storageB)}`);

    await page.goto(`${urlA}/`, { waitUntil: "load" });
    results.storageAAgain = await storageFacts(page, marker);
    say(`storage at A again: ${JSON.stringify(results.storageAAgain)}`);

    const fresh = await browser.newContext();
    const freshPage = await fresh.newPage();
    results.controlB = await pageFacts(freshPage, `${urlB}/`);
    say(`control, fresh unpaired context at B (/): ${JSON.stringify(results.controlB)}`);
    await fresh.close();
    await context.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    for (const c of [childA, childB]) {
      for (const p of descendants(c.pid)) started.add(p);
    }
    for (const pid of started) {
      if (alive(pid)) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // already gone
        }
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
    for (const pid of started) {
      if (alive(pid)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // already gone
        }
      }
    }
    say(`pids stopped: ${[...started].join(",")}; still alive: ${[...started].filter(alive).join(",") || "none"}`);
    rmSync(base, { recursive: true, force: true });
    say(`throwaway folder removed: ${!existsSync(base)}`);
    say(`listeners left on A: ${listeners(portA) || "none"}; on B: ${listeners(portB) || "none"}; on 3000: ${listeners(3000) || "none"}; on 7340: ${listeners(7340) || "none"}`);
  }
}

main().catch((error) => {
  console.error(`script error: ${error instanceof Error ? error.message : "unknown"}`);
  process.exit(1);
});
